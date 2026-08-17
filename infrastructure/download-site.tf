# -----------------------------------------------------------------------------
# Download Site (web.thymos.cloud)
# -----------------------------------------------------------------------------

# ACM Certificate for web.thymos.cloud (us-east-1 for CloudFront)
resource "aws_acm_certificate" "download_site" {
  provider          = aws.us_east_1
  domain_name       = "web.${var.base_domain}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

resource "aws_route53_record" "download_site_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.download_site.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = local.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]

  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "download_site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.download_site.arn
  validation_record_fqdns = [for record in aws_route53_record.download_site_cert_validation : record.fqdn]
}

# Frontend module for the download site
module "download_site" {
  source = "./modules/frontend"

  project_name        = var.project_name
  environment         = "${var.environment}-download"
  domain_name         = "web.${var.base_domain}"
  acm_certificate_arn = aws_acm_certificate_validation.download_site.certificate_arn
}

# DNS record for web.thymos.cloud
resource "aws_route53_record" "download_site" {
  zone_id = local.zone_id
  name    = "web.${var.base_domain}"
  type    = "A"

  alias {
    name                   = module.download_site.cloudfront_distribution_domain_name
    zone_id                = module.download_site.cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}
