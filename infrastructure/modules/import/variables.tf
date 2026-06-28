variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
}

variable "shop_table_arn" {
  description = "ARN of the Shop DynamoDB table"
  type        = string
}

variable "shop_table_name" {
  description = "Name of the Shop DynamoDB table"
  type        = string
}

variable "api_gateway_id" {
  description = "ID of the API Gateway HTTP API"
  type        = string
}

variable "api_gateway_execution_arn" {
  description = "Execution ARN of the API Gateway HTTP API"
  type        = string
}

variable "authorizer_id" {
  description = "ID of the API Gateway authorizer"
  type        = string
}

variable "consigncloud_base_url" {
  description = "Base URL for the ConsignCloud API"
  type        = string
  default     = "https://api.consigncloud.com/api/v1"
}
