module "frontend" {
  source = "./modules/frontend"

  project_name        = var.project_name
  environment         = var.environment
  domain_name         = var.domain_name
  acm_certificate_arn = aws_acm_certificate_validation.frontend.certificate_arn
}
