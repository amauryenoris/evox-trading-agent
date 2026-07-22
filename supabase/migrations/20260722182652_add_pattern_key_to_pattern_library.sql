ALTER TABLE pattern_library ADD COLUMN IF NOT EXISTS pattern_key text;
CREATE INDEX IF NOT EXISTS idx_pattern_library_pattern_key ON pattern_library (pattern_key);
