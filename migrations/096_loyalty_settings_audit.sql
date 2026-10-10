CREATE TABLE IF NOT EXISTS retail_loyalty_settings_audit (
  id SERIAL PRIMARY KEY,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kathmandu')
);
