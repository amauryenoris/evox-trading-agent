-- Dedupe first (created_at nullable — deterministic tiebreak via id)
DELETE FROM weekly_reports a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (week_start, week_end) id
  FROM weekly_reports
  ORDER BY week_start, week_end, created_at DESC NULLS LAST, id DESC
);

-- Rename table — RLS policies and indexes follow automatically
ALTER TABLE weekly_reports RENAME TO reports;

-- Add uniqueness constraint
ALTER TABLE reports
  ADD CONSTRAINT reports_week_unique
  UNIQUE (week_start, week_end);

-- Rename index for naming consistency
ALTER INDEX idx_weekly_reports_created_at RENAME TO idx_reports_created_at;
