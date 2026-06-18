ALTER TABLE trade_evaluations
  ADD COLUMN IF NOT EXISTS state_fingerprint jsonb;
