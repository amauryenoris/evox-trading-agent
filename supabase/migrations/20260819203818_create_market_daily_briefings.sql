CREATE TABLE IF NOT EXISTS market_daily_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  spx_price double precision,
  spx_sma50 double precision,
  spx_sma200 double precision,
  spx_regime text,
  gdx_relative_strength_pct double precision,
  xle_relative_strength_pct double precision,
  xlk_relative_strength_pct double precision,
  macro_sentiment_bullish_count integer,
  macro_sentiment_bearish_count integer,
  macro_sentiment_neutral_count integer,
  narrative text,
  vix_proxy_change double precision,
  upcoming_events_note text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_daily_briefings_date
  ON market_daily_briefings (briefing_date);

ALTER TABLE market_daily_briefings ENABLE ROW LEVEL SECURITY;
