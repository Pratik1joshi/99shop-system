import { NextResponse } from 'next/server';
import Database from '@/lib/db/index.js';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { ACCOUNTING_SOURCES, accountingSource } from '@/lib/accounting-source-registry.js';

const fields = ['sale_number','return_number','collection_number','grn_number','return_date','receipt_number','supplier_invoice_number','invoice_number','expense_date','category','description','reference','reason','status','amount','grand_total','refund_total','total_amount','difference_amount','payment_method','method','payment_reference','business_day_id','created_at','posted_at','completed_at'];
export async function GET(request, { params }) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'accountant'], permission: 'general_ledger.view' });
    if (auth.error) return auth.error;
    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: 'Invalid journal.' }, { status: 400 });
    const db = Database.getInstance();
    const journal = await db.get(`SELECT j.id,j.entry_date,j.memo,j.source_type,j.source_id,j.business_day_id,j.created_at,u.full_name AS actor
      FROM journal_entries j LEFT JOIN users u ON u.id=j.created_by WHERE j.id=?`, [id]);
    if (!journal) return NextResponse.json({ error: 'Journal not found.' }, { status: 404 });
    const source = accountingSource(journal);
    const definition = Object.hasOwn(ACCOUNTING_SOURCES, journal.source_type) ? ACCOUNTING_SOURCES[journal.source_type] : null;
    const document = definition?.table && source.id ? await db.get(`SELECT * FROM ${definition.table} WHERE id=?`, [source.id]) : null;
    const facts = document ? fields.filter((key) => document[key] != null).map((key) => ({ key, label: key.replaceAll('_',' '), value: document[key] })) : [];
    const lines = await db.all(`SELECT l.id,a.code,a.name,l.debit,l.credit,l.memo FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE l.journal_id=? ORDER BY l.id LIMIT 501`, [id]);
    const reversals = await db.all("SELECT id,entry_date,memo FROM journal_entries WHERE source_type='reversal' AND source_id=? ORDER BY id LIMIT 20", [id]);
    return NextResponse.json({ journal, source, facts, lines: lines.slice(0,500), lines_truncated: lines.length > 500, reversals }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return handleRouteError(error, 'Could not load journal evidence.'); }
}
