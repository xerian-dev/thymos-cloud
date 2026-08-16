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

output "hosted_zone_id" {
  description = "Route 53 hosted zone ID (only set in prod)"
  value       = var.hosted_zone_id == "" ? aws_route53_zone.main[0].zone_id : var.hosted_zone_id
}

output "hosted_zone_name_servers" {
  description = "Name servers for the hosted zone (configure at registrar)"
  value       = var.hosted_zone_id == "" ? aws_route53_zone.main[0].name_servers : []
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidation"
  value       = module.frontend.cloudfront_distribution_id
}

output "frontend_bucket_name" {
  description = "S3 bucket name for frontend deployment"
  value       = module.frontend.s3_bucket_name
}

output "frontend_domain" {
  description = "Frontend domain name"
  value       = var.domain_name
}

output "api_domain" {
  description = "API custom domain name"
  value       = var.api_domain_name
}
