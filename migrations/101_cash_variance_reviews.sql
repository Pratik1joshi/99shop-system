-- Review metadata is separate from cash counts and journals.
CREATE TABLE IF NOT EXISTS cash_variance_reviews (
  id SERIAL PRIMARY KEY,
  store_session_id INTEGER NOT NULL UNIQUE REFERENCES business_day_sessions(id),
  status TEXT NOT NULL CHECK (status IN ('ACCEPTED','ESCALATED')),
  resolution_note TEXT NOT NULL,
  reviewed_by INTEGER NOT NULL REFERENCES users(id),
  reviewed_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
