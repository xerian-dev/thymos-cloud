variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "dev"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "thymos"
}

variable "pricing_aggregator_schedule" {
  description = "EventBridge schedule expression for the pricing aggregator Lambda (default: every Sunday at 02:00 UTC)"
  type        = string
  default     = "cron(0 2 ? * SUN *)"
}

variable "base_domain" {
  description = "Base domain for the hosted zone"
  type        = string
  default     = "thymos.cloud"
}

variable "domain_name" {
  description = "Frontend CloudFront domain for this environment"
  type        = string
}

variable "api_domain_name" {
  description = "API Gateway custom domain for this environment"
  type        = string
}

variable "allowed_origins" {
  description = "CORS allowed origins for API Gateway"
  type        = list(string)
  default     = ["*"]
}

variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID (empty = create zone, non-empty = use existing)"
  type        = string
  default     = ""
}
