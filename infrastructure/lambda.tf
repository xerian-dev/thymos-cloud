# -----------------------------------------------------------------------------
# IAM Roles
# -----------------------------------------------------------------------------

resource "aws_iam_role" "shop_api_lambda" {
  name = "${var.project_name}-${var.environment}-shop-api-lambda-role"

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

resource "aws_iam_role" "shop_api_authorizer" {
  name = "${var.project_name}-${var.environment}-shop-api-authorizer-role"

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

resource "aws_iam_role_policy" "shop_api_dynamodb" {
  name = "${var.project_name}-${var.environment}-shop-api-dynamodb"
  role = aws_iam_role.shop_api_lambda.id

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
          aws_dynamodb_table.shop.arn,
          "${aws_dynamodb_table.shop.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.pricing.arn,
          "${aws_dynamodb_table.pricing.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "shop_api_s3_items" {
  name = "${var.project_name}-${var.environment}-shop-api-s3-items"
  role = aws_iam_role.shop_api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.items.arn}/items/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "shop_api_logs" {
  name = "${var.project_name}-${var.environment}-shop-api-logs"
  role = aws_iam_role.shop_api_lambda.id

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

resource "aws_iam_role_policy" "shop_api_invoke_aggregator" {
  name = "${var.project_name}-${var.environment}-shop-api-invoke-aggregator"
  role = aws_iam_role.shop_api_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.pricing_aggregator.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "shop_api_authorizer_logs" {
  name = "${var.project_name}-${var.environment}-shop-api-authorizer-logs"
  role = aws_iam_role.shop_api_authorizer.id

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

# -----------------------------------------------------------------------------
# Lambda Functions
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "shop_api" {
  function_name    = "${var.project_name}-${var.environment}-shop-api"
  role             = aws_iam_role.shop_api_lambda.arn
  handler          = "handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 256
  timeout          = 30
  filename         = "../projects/shop-api/dist/handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/handler.zip")

  environment {
    variables = {
      TABLE_NAME               = aws_dynamodb_table.shop.name
      PRICING_TABLE_NAME       = aws_dynamodb_table.pricing.name
      COGNITO_USER_POOL_ID     = aws_cognito_user_pool.main.id
      BUCKET_NAME              = aws_s3_bucket.items.id
      AGGREGATOR_FUNCTION_NAME = aws_lambda_function.pricing_aggregator.function_name
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_lambda_function" "shop_api_authorizer" {
  function_name    = "${var.project_name}-${var.environment}-shop-api-authorizer"
  role             = aws_iam_role.shop_api_authorizer.arn
  handler          = "authorizer.handler"
  runtime          = "nodejs20.x"
  memory_size      = 128
  timeout          = 5
  filename         = "../projects/shop-api/dist/authorizer.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/authorizer.zip")

  environment {
    variables = {
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Pricing Aggregator IAM Role
# -----------------------------------------------------------------------------

resource "aws_iam_role" "pricing_aggregator_lambda" {
  name = "${var.project_name}-${var.environment}-pricing-aggregator-lambda-role"

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
# Pricing Aggregator IAM Policies
# -----------------------------------------------------------------------------

resource "aws_iam_role_policy" "pricing_aggregator_dynamodb" {
  name = "${var.project_name}-${var.environment}-pricing-aggregator-dynamodb"
  role = aws_iam_role.pricing_aggregator_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.shop.arn,
          "${aws_dynamodb_table.shop.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.pricing.arn,
          "${aws_dynamodb_table.pricing.arn}/index/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "pricing_aggregator_logs" {
  name = "${var.project_name}-${var.environment}-pricing-aggregator-logs"
  role = aws_iam_role.pricing_aggregator_lambda.id

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

# -----------------------------------------------------------------------------
# Pricing Aggregator Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "pricing_aggregator" {
  function_name    = "${var.project_name}-${var.environment}-pricing-aggregator"
  role             = aws_iam_role.pricing_aggregator_lambda.arn
  handler          = "aggregator-handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 512
  timeout          = 300
  filename         = "../projects/shop-api/dist/aggregator-handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/aggregator-handler.zip")

  environment {
    variables = {
      TABLE_NAME         = aws_dynamodb_table.shop.name
      PRICING_TABLE_NAME = aws_dynamodb_table.pricing.name
      REGION             = data.aws_region.current.name
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# TEMPORARY: Pricing Data Migration Lambda (remove after migration)
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "migrate_pricing" {
  function_name    = "${var.project_name}-${var.environment}-migrate-pricing"
  role             = aws_iam_role.pricing_aggregator_lambda.arn
  handler          = "migrate-pricing-data.handler"
  runtime          = "nodejs20.x"
  memory_size      = 256
  timeout          = 300
  filename         = "../projects/shop-api/dist/migrate-pricing-data.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/migrate-pricing-data.zip")

  environment {
    variables = {
      TABLE_NAME         = aws_dynamodb_table.shop.name
      PRICING_TABLE_NAME = aws_dynamodb_table.pricing.name
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    Temporary   = "true"
  }
}

# -----------------------------------------------------------------------------
# Lambda Permissions (API Gateway invocation)
# -----------------------------------------------------------------------------

resource "aws_lambda_permission" "shop_api_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shop_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.shop_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "shop_api_authorizer_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shop_api_authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.shop_api.execution_arn}/*/*"
}
