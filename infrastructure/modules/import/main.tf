# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# -----------------------------------------------------------------------------
# DynamoDB Import Table
# -----------------------------------------------------------------------------

resource "aws_dynamodb_table" "import" {
  name             = "${var.project_name}-${var.environment}-import"
  billing_mode     = "PAY_PER_REQUEST"
  hash_key         = "PK"
  range_key        = "SK"
  stream_enabled   = true
  stream_view_type = "NEW_IMAGE"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# SQS Dead Letter Queue — Stream Processing Failures
# -----------------------------------------------------------------------------

resource "aws_sqs_queue" "stream_dlq" {
  name                      = "${var.project_name}-${var.environment}-import-stream-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Stream Lambda IAM Role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "stream_lambda" {
  name = "${var.project_name}-${var.environment}-stream-sync-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Stream Lambda IAM Policies
# -----------------------------------------------------------------------------

resource "aws_iam_role_policy" "stream_lambda_stream_read" {
  name = "${var.project_name}-${var.environment}-stream-sync-stream-read"
  role = aws_iam_role.stream_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetRecords",
          "dynamodb:GetShardIterator",
          "dynamodb:DescribeStream",
          "dynamodb:ListStreams"
        ]
        Resource = aws_dynamodb_table.import.stream_arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "stream_lambda_import_table" {
  name = "${var.project_name}-${var.environment}-stream-sync-import-table"
  role = aws_iam_role.stream_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ]
        Resource = aws_dynamodb_table.import.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "stream_lambda_shop_table" {
  name = "${var.project_name}-${var.environment}-stream-sync-shop-table"
  role = aws_iam_role.stream_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:TransactWriteItems"
        ]
        Resource = [
          var.shop_table_arn,
          "${var.shop_table_arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "stream_lambda_logs" {
  name = "${var.project_name}-${var.environment}-stream-sync-logs"
  role = aws_iam_role.stream_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "stream_lambda_dlq" {
  name = "${var.project_name}-${var.environment}-stream-sync-dlq"
  role = aws_iam_role.stream_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.stream_dlq.arn
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Stream Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "stream_sync" {
  function_name    = "${var.project_name}-${var.environment}-stream-sync"
  role             = aws_iam_role.stream_lambda.arn
  handler          = "stream-handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 256
  timeout          = 60
  filename         = "../projects/shop-api/dist/stream-handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/stream-handler.zip")

  environment {
    variables = {
      TABLE_NAME        = var.shop_table_name
      IMPORT_TABLE_NAME = aws_dynamodb_table.import.name
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# DynamoDB Stream Event Source Mapping
# -----------------------------------------------------------------------------

resource "aws_lambda_event_source_mapping" "stream" {
  event_source_arn                   = aws_dynamodb_table.import.stream_arn
  function_name                      = aws_lambda_function.stream_sync.arn
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_retry_attempts             = 3
  bisect_batch_on_function_error     = true
  maximum_batching_window_in_seconds = 5
  function_response_types            = ["ReportBatchItemFailures"]

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.stream_dlq.arn
    }
  }

  filter_criteria {
    filter {
      pattern = jsonencode({
        eventName = ["INSERT", "MODIFY"]
        dynamodb = {
          NewImage = {
            PK       = { S = [{ prefix = "IMPORT#CONSIGNCLOUD#" }] }
            syncedAt = [{ exists = false }]
          }
        }
      })
    }
  }
}

# -----------------------------------------------------------------------------
# SSM Parameter for ConsignCloud API Key
# -----------------------------------------------------------------------------

resource "aws_ssm_parameter" "consigncloud_api_key" {
  name  = "/${var.project_name}/${var.environment}/consigncloud-api-key"
  type  = "SecureString"
  value = "placeholder"

  lifecycle {
    ignore_changes = [value]
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# IAM Role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "lambda" {
  name = "${var.project_name}-${var.environment}-shop-import-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# IAM Policies
# -----------------------------------------------------------------------------

resource "aws_iam_role_policy" "import_table" {
  name = "${var.project_name}-${var.environment}-shop-import-import-table"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem"
        ]
        Resource = aws_dynamodb_table.import.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "shop_table" {
  name = "${var.project_name}-${var.environment}-shop-import-shop-table"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:TransactWriteItems"
        ]
        Resource = [
          var.shop_table_arn,
          "${var.shop_table_arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "ssm" {
  name = "${var.project_name}-${var.environment}-shop-import-ssm"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = aws_ssm_parameter.consigncloud_api_key.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "logs" {
  name = "${var.project_name}-${var.environment}-shop-import-logs"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "start_step_function" {
  name = "${var.project_name}-${var.environment}-shop-import-start-sfn"
  role = aws_iam_role.lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["states:StartExecution"]
        Resource = "arn:aws:states:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:stateMachine:${var.project_name}-${var.environment}-shop-import-loop"
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "import" {
  function_name    = "${var.project_name}-${var.environment}-shop-import"
  role             = aws_iam_role.lambda.arn
  handler          = "import-handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 512
  timeout          = 300
  filename         = "../projects/shop-api/dist/import-handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/import-handler.zip")

  environment {
    variables = {
      TABLE_NAME            = var.shop_table_name
      IMPORT_TABLE_NAME     = aws_dynamodb_table.import.name
      SSM_API_KEY_PATH      = aws_ssm_parameter.consigncloud_api_key.name
      CONSIGNCLOUD_BASE_URL = var.consigncloud_base_url
      STATE_MACHINE_ARN     = "arn:aws:states:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:stateMachine:${var.project_name}-${var.environment}-shop-import-loop"
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_lambda_function_event_invoke_config" "import_no_retry" {
  function_name          = aws_lambda_function.import.function_name
  maximum_retry_attempts = 0
}

# -----------------------------------------------------------------------------
# Step Functions State Machine
# -----------------------------------------------------------------------------

resource "aws_iam_role" "step_function" {
  name = "${var.project_name}-${var.environment}-shop-import-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "states.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_iam_role_policy" "step_function_invoke_lambda" {
  name = "${var.project_name}-${var.environment}-shop-import-sfn-invoke-lambda"
  role = aws_iam_role.step_function.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = aws_lambda_function.import.arn
      }
    ]
  })
}

resource "aws_sfn_state_machine" "import_loop" {
  name     = "${var.project_name}-${var.environment}-shop-import-loop"
  role_arn = aws_iam_role.step_function.arn

  definition = jsonencode({
    Comment = "Item import processing loop — invokes Lambda repeatedly until work is complete"
    StartAt = "ProcessBatch"
    States = {
      ProcessBatch = {
        Type     = "Task"
        Resource = "arn:aws:states:::lambda:invoke"
        Parameters = {
          FunctionName = aws_lambda_function.import.arn
          Payload = {
            "action"  = "resume-internal"
            "jobId.$" = "$.jobId"
            "phase.$" = "$.phase"
            "type.$"  = "$.type"
          }
        }
        ResultSelector = {
          "result.$" = "States.StringToJson($.Payload.body)"
        }
        ResultPath     = "$.taskResult"
        TimeoutSeconds = 310
        Retry = [
          {
            ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
            IntervalSeconds = 5
            MaxAttempts     = 3
            BackoffRate     = 2
          }
        ]
        Next = "CheckStatus"
      }
      CheckStatus = {
        Type = "Choice"
        Choices = [
          {
            Variable     = "$.taskResult.result.status"
            StringEquals = "continue"
            Next         = "PrepareNextIteration"
          }
        ]
        Default = "Done"
      }
      PrepareNextIteration = {
        Type = "Pass"
        Parameters = {
          "action"  = "resume-internal"
          "jobId.$" = "$.taskResult.result.jobId"
          "phase.$" = "$.taskResult.result.phase"
          "type.$"  = "$.taskResult.result.type"
        }
        Next = "WaitBeforeNext"
      }
      WaitBeforeNext = {
        Type    = "Wait"
        Seconds = 2
        Next    = "ProcessBatch"
      }
      Done = {
        Type = "Succeed"
      }
    }
  })

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# EventBridge Scheduler — Scheduled Sync
# -----------------------------------------------------------------------------

resource "aws_scheduler_schedule" "scheduled_sync" {
  name        = "${var.project_name}-${var.environment}-scheduled-sync"
  description = "Triggers ConsignCloud import every 15 minutes"

  schedule_expression          = "rate(15 minutes)"
  schedule_expression_timezone = "UTC"
  state                        = "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_lambda_function.import.arn
    role_arn = aws_iam_role.scheduler_role.arn

    input = jsonencode({
      action = "scheduled-sync"
    })

    retry_policy {
      maximum_retry_attempts       = 0
      maximum_event_age_in_seconds = 60
    }
  }

}

resource "aws_iam_role" "scheduler_role" {
  name = "${var.project_name}-${var.environment}-scheduler-sync-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_iam_role_policy" "scheduler_invoke_lambda" {
  name = "${var.project_name}-${var.environment}-scheduler-invoke-lambda"
  role = aws_iam_role.scheduler_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.import.arn
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# Lambda Permission (API Gateway invocation)
# -----------------------------------------------------------------------------

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.import.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*/*"
}

# -----------------------------------------------------------------------------
# API Gateway Integration
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "import" {
  api_id                 = var.api_gateway_id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.import.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# -----------------------------------------------------------------------------
# API Gateway Routes
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_route" "post_import_fetch" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/fetch"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "post_import_sync" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/sync"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "post_import_items_start" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/items/start"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "post_import_items_resume" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/items/resume"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "post_import_items_status" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/items/status"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "post_import_items_cancel" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/items/cancel"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "post_import_sales_start" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/sales/start"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "post_import_sales_sync" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/sales/sync"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "post_import_sales_resume" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/sales/resume"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "post_import_sales_status" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/sales/status"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "post_import_sales_cancel" {
  api_id    = var.api_gateway_id
  route_key = "POST /api/import/sales/cancel"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "get_import_status" {
  api_id    = var.api_gateway_id
  route_key = "GET /api/import/status"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "get_import_items_history" {
  api_id    = var.api_gateway_id
  route_key = "GET /api/import/items/history"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "get_import_sales_history" {
  api_id    = var.api_gateway_id
  route_key = "GET /api/import/sales/history"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}

resource "aws_apigatewayv2_route" "get_import_accounts_history" {
  api_id    = var.api_gateway_id
  route_key = "GET /api/import/accounts/history"
  target    = "integrations/${aws_apigatewayv2_integration.import.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = var.authorizer_id
}
