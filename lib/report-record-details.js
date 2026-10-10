/**
 * The full record behind a clicked report row. Expense rows open the expense
 * itself; every other row shows the information the report already holds.
 */

function field(label, value, format = 'text', link = null) {
  return { label, value: value == null || value === '' ? null : value, format, ...(link ? { link } : {}) };
}

function section(title, items) {
  return { type: 'fields', title, items: items.filter((item) => item.value != null) };
}

async function expenseDetails(db, row) {
  let expense = null;
  if (row._record_id) expense = await db.get(`SELECT e.*,u.full_name AS logged_by_name FROM expenses e LEFT JOIN users u ON u.id=e.logged_by WHERE e.id=?`, [row._record_id]);
  if (!expense && row.description) expense = await db.get(
    `SELECT e.*,u.full_name AS logged_by_name FROM expenses e LEFT JOIN users u ON u.id=e.logged_by
     WHERE COALESCE(e.purchase_date,CAST(e.expense_date AS TEXT))=? AND COALESCE(e.description,'')=?
     ORDER BY e.id DESC LIMIT 1`, [row.spent_on || row.date, row.description === '—' ? '' : row.description]
  );
  if (!expense) return null;
  const sourceLink = expense.source_type && expense.source_id
    ? { type: expense.source_type, id: expense.source_id }
    : null;
  return {
    eyebrow: 'Expense record', title: expense.description || `Expense #${expense.id}`,
    subtitle: `${expense.category || 'Other'} · ${expense.purchase_date || expense.expense_date}`,
    status: expense.status || 'active',
    summary: [field('Amount', expense.amount, 'currency'), field('Paid by', expense.payment_method || 'cash'), field('Supplier / payee', expense.supplier || '—'), field('Logged by', expense.logged_by_name || 'System')],
    sections: [section('Expense details', [
      field('Expense code', `EXP-${expense.id}`),
      field('Date', expense.purchase_date || expense.expense_date),
      field('Category', String(expense.category || '').replace(/_/g, ' ')),
      field('Payment method', String(expense.payment_method || 'cash').replace(/_/g, ' ')),
      field('Origin', expense.source_type ? `Generated from ${String(expense.source_type).replace(/_/g, ' ')} #${expense.source_id}` : 'Entered manually', 'text', sourceLink),
      field('Receipt', expense.receipt_url), field('Notes', expense.notes),
      field('Created', expense.created_at, 'datetime'),
    ])],
  };
}

export async function buildReportRecordDetails(db, { tab, tableId, row = {} }) {
  if (tab === 'finance' || tab === 'expenses') {
    const expense = await expenseDetails(db, row);
    if (expense) return expense;
  }
  return {
    eyebrow: 'Report breakdown', title: tableId ? String(tableId).replace(/-/g, ' ') : 'Record details',
    subtitle: 'All information available for this report row',
    summary: [],
    sections: [section('Recorded information', Object.entries(row).filter(([key]) => !key.startsWith('_')).map(([key, value]) => field(key.replace(/_/g, ' '), value)))],
  };
}
