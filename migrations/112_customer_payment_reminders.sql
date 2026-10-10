-- A reminder row records that staff opened a payment reminder for a customer.
-- It is not proof of delivery; WhatsApp click-to-chat is sent by the staff member.
CREATE TABLE IF NOT EXISTS customer_payment_reminders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp')),
  amount_due NUMERIC(14,2) NOT NULL,
  message TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_payment_reminders_customer ON customer_payment_reminders(customer_id, created_at);
