output "cloudfront_distribution_domain_name" {
  description = "CloudFront distribution domain name for DNS alias target"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "cloudfront_distribution_hosted_zone_id" {
  description = "CloudFront distribution hosted zone ID for Route 53 alias"
  value       = aws_cloudfront_distribution.frontend.hosted_zone_id
}

output "s3_bucket_name" {
  description = "S3 bucket name for frontend deployment"
  value       = aws_s3_bucket.frontend.id
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN for IAM policies"
  value       = aws_s3_bucket.frontend.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidation"
  value       = aws_cloudfront_distribution.frontend.id
}
