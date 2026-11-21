CREATE TABLE IF NOT EXISTS api_events (
  organization_id String,
  project_id String,
  timestamp DateTime64(3, 'UTC'),
  service_name LowCardinality(String),
  operation_name LowCardinality(String),
  operation_type LowCardinality(String),
  duration_ms Float64,
  http_status UInt16,
  graphql_error_count UInt16,
  network_error UInt8,
  error_message String,
  trace_id String,
  span_id String
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (organization_id, project_id, service_name, operation_name, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY
