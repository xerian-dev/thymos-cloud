output "cognito_user_pool_id" {
  description = "Cognito User Pool ID for application configuration"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool Client ID for the shop application"
  value       = aws_cognito_user_pool_client.shop.id
}

output "aws_region" {
  description = "AWS region where resources are deployed"
  value       = data.aws_region.current.name
}

output "dynamodb_table_name" {
  description = "DynamoDB table name for the shop application"
  value       = aws_dynamodb_table.shop.name
}

output "dynamodb_table_arn" {
  description = "DynamoDB table ARN for IAM policy configuration"
  value       = aws_dynamodb_table.shop.arn
}

output "shop_api_url" {
  description = "API Gateway invoke URL for the shop API"
  value       = aws_apigatewayv2_stage.default.invoke_url
}
