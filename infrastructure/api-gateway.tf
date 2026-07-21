# -----------------------------------------------------------------------------
# API Gateway HTTP API
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "shop_api" {
  name          = "${var.project_name}-${var.environment}-shop-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["Authorization", "Content-Type"]
    max_age       = 3600
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Stage
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.shop_api.id
  name        = "$default"
  auto_deploy = true

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# -----------------------------------------------------------------------------
# Authorizer
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id                            = aws_apigatewayv2_api.shop_api.id
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = aws_lambda_function.shop_api_authorizer.invoke_arn
  authorizer_payload_format_version = "2.0"
  authorizer_result_ttl_in_seconds  = 3600
  identity_sources                  = ["$request.header.Authorization"]
  name                              = "${var.project_name}-${var.environment}-cognito-authorizer"
  enable_simple_responses           = true
}

# -----------------------------------------------------------------------------
# Integration
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "monolambda" {
  api_id                 = aws_apigatewayv2_api.shop_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.shop_api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_route" "get_accounts" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "GET /api/accounts"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_next_number" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "GET /api/accounts/next-number"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "post_accounts" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "POST /api/accounts"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "put_account" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "PUT /api/accounts/{accountNumber}"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "delete_account" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "DELETE /api/accounts/{accountNumber}"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "post_items" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "POST /api/items"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "put_item" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "PUT /api/items/{uuid}"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "delete_item" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "DELETE /api/items/{uuid}"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_items" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "GET /api/items"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_next_sku" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "GET /api/items/next-sku"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "post_items_upload_url" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "POST /api/items/upload-url"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}
# -----------------------------------------------------------------------------
# Sales Routes
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_route" "get_sales" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "GET /api/sales"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_next_sale_number" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "GET /api/sales/next-number"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "post_sales" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "POST /api/sales"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "put_sale" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "PUT /api/sales/{uuid}"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "delete_sale" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "DELETE /api/sales/{uuid}"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# -----------------------------------------------------------------------------
# Employee Routes
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_route" "get_employees" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "GET /api/employees"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_employee" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "GET /api/employees/{uuid}"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "post_employees_batch" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "POST /api/employees/batch"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

# -----------------------------------------------------------------------------
# Import Account Routes
# -----------------------------------------------------------------------------

resource "aws_apigatewayv2_route" "post_import_accounts_start" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "POST /api/import/accounts/start"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "post_import_accounts_status" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "POST /api/import/accounts/status"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "post_import_accounts_resume" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "POST /api/import/accounts/resume"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "post_import_accounts_cancel" {
  api_id    = aws_apigatewayv2_api.shop_api.id
  route_key = "POST /api/import/accounts/cancel"
  target    = "integrations/${aws_apigatewayv2_integration.monolambda.id}"

  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}
