output "import_table_name" {
  description = "Name of the Import DynamoDB table"
  value       = aws_dynamodb_table.import.name
}

output "import_table_arn" {
  description = "ARN of the Import DynamoDB table"
  value       = aws_dynamodb_table.import.arn
}

output "import_table_stream_arn" {
  description = "ARN of the Import DynamoDB table stream"
  value       = aws_dynamodb_table.import.stream_arn
}

output "stream_dlq_arn" {
  description = "ARN of the stream processing dead letter queue"
  value       = aws_sqs_queue.stream_dlq.arn
}

output "lambda_function_name" {
  description = "Name of the Import Lambda function"
  value       = aws_lambda_function.import.function_name
}

output "state_machine_arn" {
  description = "ARN of the import loop Step Functions state machine"
  value       = aws_sfn_state_machine.import_loop.arn
}

output "stream_lambda_function_name" {
  description = "Name of the Stream Sync Lambda function"
  value       = aws_lambda_function.stream_sync.function_name
}

output "stream_lambda_arn" {
  description = "ARN of the Stream Sync Lambda function"
  value       = aws_lambda_function.stream_sync.arn
}
