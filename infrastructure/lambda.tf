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
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = [
          "${aws_s3_bucket.items.arn}/items/*",
          "${aws_s3_bucket.items.arn}/brand-mappings/*",
          "${aws_s3_bucket.items.arn}/color-mappings/*",
          "${aws_s3_bucket.items.arn}/description-mappings/*"
        ]
      },
      {
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.items.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["brand-mappings/*", "color-mappings/*", "description-mappings/*"]
          }
        }
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
        Effect = "Allow"
        Action = "lambda:InvokeFunction"
        Resource = [
          aws_lambda_function.pricing_aggregator.arn,
          aws_lambda_function.brand_cluster.arn,
          aws_lambda_function.brand_apply.arn,
          aws_lambda_function.color_cluster.arn,
          aws_lambda_function.color_apply.arn,
          aws_lambda_function.desc_cluster.arn,
          aws_lambda_function.desc_apply.arn
        ]
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
      TABLE_NAME                  = aws_dynamodb_table.shop.name
      PRICING_TABLE_NAME          = aws_dynamodb_table.pricing.name
      COGNITO_USER_POOL_ID        = aws_cognito_user_pool.main.id
      BUCKET_NAME                 = aws_s3_bucket.items.id
      AGGREGATOR_FUNCTION_NAME    = aws_lambda_function.pricing_aggregator.function_name
      BRAND_CLUSTER_FUNCTION_NAME = aws_lambda_function.brand_cluster.function_name
      BRAND_APPLY_FUNCTION_NAME   = aws_lambda_function.brand_apply.function_name
      COLOR_CLUSTER_FUNCTION_NAME = aws_lambda_function.color_cluster.function_name
      COLOR_APPLY_FUNCTION_NAME   = aws_lambda_function.color_apply.function_name
      DESC_CLUSTER_FUNCTION_NAME  = aws_lambda_function.desc_cluster.function_name
      DESC_APPLY_FUNCTION_NAME    = aws_lambda_function.desc_apply.function_name
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
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
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

resource "aws_iam_role_policy" "pricing_aggregator_s3" {
  name = "${var.project_name}-${var.environment}-pricing-aggregator-s3"
  role = aws_iam_role.pricing_aggregator_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.items.arn}/brand-mappings/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.items.arn}/color-mappings/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.items.arn}/description-mappings/*"
      },
      {
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.items.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["brand-mappings/*", "color-mappings/*", "description-mappings/*"]
          }
        }
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
  memory_size      = 2048
  timeout          = 900
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
# Brand Cluster Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "brand_cluster" {
  function_name    = "${var.project_name}-${var.environment}-brand-cluster"
  role             = aws_iam_role.pricing_aggregator_lambda.arn
  handler          = "brand-cluster-handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 1024
  timeout          = 900
  filename         = "../projects/shop-api/dist/brand-cluster-handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/brand-cluster-handler.zip")

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.shop.name
      BUCKET_NAME = aws_s3_bucket.items.id
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Brand Apply Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "brand_apply" {
  function_name    = "${var.project_name}-${var.environment}-brand-apply"
  role             = aws_iam_role.pricing_aggregator_lambda.arn
  handler          = "brand-apply-handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 1024
  timeout          = 900
  filename         = "../projects/shop-api/dist/brand-apply-handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/brand-apply-handler.zip")

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.shop.name
      BUCKET_NAME = aws_s3_bucket.items.id
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Color Cluster Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "color_cluster" {
  function_name    = "${var.project_name}-${var.environment}-color-cluster"
  role             = aws_iam_role.pricing_aggregator_lambda.arn
  handler          = "color-cluster-handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 1024
  timeout          = 900
  filename         = "../projects/shop-api/dist/color-cluster-handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/color-cluster-handler.zip")

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.shop.name
      BUCKET_NAME = aws_s3_bucket.items.id
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Color Apply Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "color_apply" {
  function_name    = "${var.project_name}-${var.environment}-color-apply"
  role             = aws_iam_role.pricing_aggregator_lambda.arn
  handler          = "color-apply-handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 1024
  timeout          = 900
  filename         = "../projects/shop-api/dist/color-apply-handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/color-apply-handler.zip")

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.shop.name
      BUCKET_NAME = aws_s3_bucket.items.id
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Description Cluster Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "desc_cluster" {
  function_name    = "${var.project_name}-${var.environment}-desc-cluster"
  role             = aws_iam_role.pricing_aggregator_lambda.arn
  handler          = "description-cluster-handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 1024
  timeout          = 900
  filename         = "../projects/shop-api/dist/description-cluster-handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/description-cluster-handler.zip")

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.shop.name
      BUCKET_NAME = aws_s3_bucket.items.id
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Description Apply Lambda Function
# -----------------------------------------------------------------------------

resource "aws_lambda_function" "desc_apply" {
  function_name    = "${var.project_name}-${var.environment}-desc-apply"
  role             = aws_iam_role.pricing_aggregator_lambda.arn
  handler          = "description-apply-handler.handler"
  runtime          = "nodejs20.x"
  memory_size      = 1024
  timeout          = 900
  filename         = "../projects/shop-api/dist/description-apply-handler.zip"
  source_code_hash = filebase64sha256("../projects/shop-api/dist/description-apply-handler.zip")

  environment {
    variables = {
      TABLE_NAME  = aws_dynamodb_table.shop.name
      BUCKET_NAME = aws_s3_bucket.items.id
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
