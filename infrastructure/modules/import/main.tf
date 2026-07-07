# -----------------------------------------------------------------------------
# DynamoDB Import Table
# -----------------------------------------------------------------------------

resource "aws_dynamodb_table" "import" {
  name         = "${var.project_name}-${var.environment}-import"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
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

resource "aws_iam_role_policy" "self_invoke" {
  name = "${var.project_name}-${var.environment}-shop-import-self-invoke"
  role = aws_iam_role.lambda.id

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

# -----------------------------------------------------------------------------
# Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "import" {
  function_name    = "${var.project_name}-${var.environment}-shop-import"
  role             = aws_iam_role.lambda.arn
  handler          = "import-handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 256
  timeout          = 300
  filename         = "../projects/shop-api/dist/import-handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/import-handler.zip")

  environment {
    variables = {
      TABLE_NAME            = var.shop_table_name
      IMPORT_TABLE_NAME     = aws_dynamodb_table.import.name
      SSM_API_KEY_PATH      = aws_ssm_parameter.consigncloud_api_key.name
      CONSIGNCLOUD_BASE_URL = var.consigncloud_base_url
      FUNCTION_NAME         = "${var.project_name}-${var.environment}-shop-import"
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
