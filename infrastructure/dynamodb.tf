resource "aws_dynamodb_table" "shop" {
  name         = "${var.project_name}-${var.environment}-shop"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}
