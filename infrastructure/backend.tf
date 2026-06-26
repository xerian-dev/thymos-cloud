terraform {
  backend "s3" {
    bucket = "thymos-dev-tfstate"
    key    = "infrastructure/terraform.tfstate"
    region = "eu-central-1"
  }
}
