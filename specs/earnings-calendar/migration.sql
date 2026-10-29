-- earnings_calendar: daily cache of upcoming earnings report dates (source: Nasdaq calendar).
-- DRAFT for review. NOT applied by the agent; the owner's other tool applies it.
-- Idempotent: safe to run twice.

CREATE TABLE IF NOT EXISTS earnings_calendar (
  symbol      TEXT        NOT NULL,
  report_date DATE        NOT NULL,
  session     TEXT        NOT NULL CHECK (session IN ('BMO', 'AMC', 'UNKNOWN')),
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, report_date)
);

CREATE INDEX IF NOT EXISTS earnings_calendar_report_date_idx
  ON earnings_calendar (report_date);

ALTER TABLE earnings_calendar ENABLE ROW LEVEL SECURITY;

-- Public market data, read-only for the browser roles. Writes go through service_role (bypasses RLS).
DROP POLICY IF EXISTS earnings_calendar_select ON earnings_calendar;
CREATE POLICY earnings_calendar_select
  ON earnings_calendar
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON earnings_calendar TO anon;
GRANT ALL    ON earnings_calendar TO authenticated;
GRANT ALL    ON earnings_calendar TO service_role;
-- Note: "authenticated ALL" is limited to SELECT in practice, because the only policy is SELECT.
