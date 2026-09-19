import { listBusinessDaySessions, businessDaySummary, ensureBusinessDaySchema } from '../lib/business-days.js';
import Database from '../lib/db/index.js';

const db = Database.getInstance();
await ensureBusinessDaySchema(db);
const day = await db.get(`SELECT id FROM business_days WHERE status='open' ORDER BY id DESC LIMIT 1`);
if (!day) {
  console.log('No open business day');
  process.exit(0);
}
const sessions = await listBusinessDaySessions(db, day.id);
const summary = await businessDaySummary(db, day.id);
console.log(JSON.stringify({
  dayId: day.id,
  sessions: sessions.map((s) => ({
    n: s.session_number,
    status: s.status,
    opening: s.opening_cash,
    expected: s.expected_cash,
    counted: s.counted_cash,
    hasBreakdown: !!s.cash_breakdown,
  })),
  summarySessions: (summary.sessions || []).length,
}, null, 2));
