CREATE TABLE IF NOT EXISTS request_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS request_limits_window ON request_limits(window_start);
