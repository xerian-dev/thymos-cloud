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
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:TransactWriteItems"
        ]
        Resource = aws_dynamodb_table.shop.arn
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
      TABLE_NAME           = aws_dynamodb_table.shop.name
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
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
