resource "aws_ssm_parameter" "consigncloud_api_key" {
  name  = "/${var.project_name}/${var.environment}/consigncloud-api-key"
  type  = "SecureString"
  value = "placeholder"

  lifecycle {
    ignore_changes = [value]
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}
