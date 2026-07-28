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
