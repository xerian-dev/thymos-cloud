variable "project_name" {
  description = "Resource naming prefix"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "domain_name" {
  description = "CloudFront alternate domain name"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for the CloudFront distribution (must be in us-east-1)"
  type        = string
}

variable "default_root_object" {
  description = "Default root object for the CloudFront distribution"
  type        = string
  default     = "index.html"
}
