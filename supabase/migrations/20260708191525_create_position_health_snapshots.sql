CREATE TABLE IF NOT EXISTS position_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  position_buy_timestamp text NOT NULL,
  snapshot_timestamp text NOT NULL,
  entry_adx_bucket text,
  entry_macd_bucket text,
  entry_z_bucket text,
  entry_spx_regime text,
  current_adx_bucket text,
  current_macd_bucket text,
  current_z_bucket text,
  current_spx_regime text,
  current_adx double precision,
  current_macd_histogram double precision,
  current_z_score double precision,
  current_price double precision,
  days_since_entry integer
);

CREATE INDEX IF NOT EXISTS idx_position_health_snapshots_symbol_time
  ON position_health_snapshots (symbol, snapshot_timestamp);

ALTER TABLE position_health_snapshots ENABLE ROW LEVEL SECURITY;
