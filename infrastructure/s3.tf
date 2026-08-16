# -----------------------------------------------------------------------------
# Items Upload Bucket
# -----------------------------------------------------------------------------

resource "aws_s3_bucket" "items" {
  bucket = "${var.project_name}-${var.environment}-items"

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "items" {
  bucket = aws_s3_bucket.items.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "items" {
  bucket = aws_s3_bucket.items.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "items" {
  bucket = aws_s3_bucket.items.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = ["*"]
    max_age_seconds = 3600
  }
}
