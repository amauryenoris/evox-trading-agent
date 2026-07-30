ALTER TABLE open_position_contexts
ADD COLUMN IF NOT EXISTS trailing_stop_order_id text;
