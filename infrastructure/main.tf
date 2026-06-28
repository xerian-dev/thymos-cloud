terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.100.0"
    }
  }
}

provider "aws" {}

data "aws_region" "current" {}

resource "aws_cognito_user_pool" "main" {
  name = "${var.project_name}-${var.environment}-user-pool"

  alias_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 254
    }
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_cognito_user_pool_client" "shop" {
  name         = "${var.project_name}-${var.environment}-shop-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.main.id
  description  = "Administrator role group"
}

# -----------------------------------------------------------------------------
# Import Module
# -----------------------------------------------------------------------------

module "import" {
  source = "./modules/import"

  project_name              = var.project_name
  environment               = var.environment
  shop_table_arn            = aws_dynamodb_table.shop.arn
  shop_table_name           = aws_dynamodb_table.shop.name
  api_gateway_id            = aws_apigatewayv2_api.shop_api.id
  api_gateway_execution_arn = aws_apigatewayv2_api.shop_api.execution_arn
  authorizer_id             = aws_apigatewayv2_authorizer.cognito.id
}
