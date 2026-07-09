output "import_table_name" {
  description = "Name of the Import DynamoDB table"
  value       = aws_dynamodb_table.import.name
}

output "import_table_arn" {
  description = "ARN of the Import DynamoDB table"
  value       = aws_dynamodb_table.import.arn
}

output "lambda_function_name" {
  description = "Name of the Import Lambda function"
  value       = aws_lambda_function.import.function_name
}

output "state_machine_arn" {
  description = "ARN of the import loop Step Functions state machine"
  value       = aws_sfn_state_machine.import_loop.arn
}
