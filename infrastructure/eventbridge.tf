# -----------------------------------------------------------------------------
# Pricing Aggregator Schedule (EventBridge)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "pricing_aggregator_schedule" {
  name                = "${var.project_name}-${var.environment}-pricing-aggregator-schedule"
  description         = "Triggers the pricing aggregator Lambda on a weekly schedule"
  schedule_expression = var.pricing_aggregator_schedule

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_cloudwatch_event_target" "pricing_aggregator" {
  rule      = aws_cloudwatch_event_rule.pricing_aggregator_schedule.name
  target_id = "${var.project_name}-${var.environment}-pricing-aggregator"
  arn       = aws_lambda_function.pricing_aggregator.arn

  dead_letter_config {
    arn = aws_sqs_queue.pricing_aggregator_dlq.arn
  }
}

resource "aws_lambda_permission" "pricing_aggregator_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pricing_aggregator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.pricing_aggregator_schedule.arn
}

# -----------------------------------------------------------------------------
# Dead Letter Queue for failed EventBridge invocations
# -----------------------------------------------------------------------------

resource "aws_sqs_queue" "pricing_aggregator_dlq" {
  name                      = "${var.project_name}-${var.environment}-pricing-aggregator-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

resource "aws_sqs_queue_policy" "pricing_aggregator_dlq" {
  queue_url = aws_sqs_queue.pricing_aggregator_dlq.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.pricing_aggregator_dlq.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_rule.pricing_aggregator_schedule.arn
          }
        }
      }
    ]
  })
}
