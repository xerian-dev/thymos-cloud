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
