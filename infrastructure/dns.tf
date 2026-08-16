# -----------------------------------------------------------------------------
# Route 53 Hosted Zone
# Created only in prod (when hosted_zone_id is not provided).
# Dev references the zone ID via variable after prod is deployed.
# -----------------------------------------------------------------------------

resource "aws_route53_zone" "main" {
  count = var.hosted_zone_id == "" ? 1 : 0
  name  = var.base_domain

  tags = {
    Project     = var.project_name
    Environment = var.environment
  }
}

locals {
  zone_id = var.hosted_zone_id != "" ? var.hosted_zone_id : aws_route53_zone.main[0].zone_id
}

# -----------------------------------------------------------------------------
# DNS Records
# -----------------------------------------------------------------------------

resource "aws_route53_record" "frontend" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.frontend.cloudfront_distribution_domain_name
    zone_id                = module.frontend.cloudfront_distribution_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api" {
  zone_id = local.zone_id
  name    = var.api_domain_name
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
