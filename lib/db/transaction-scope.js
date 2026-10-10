/** Explicit adapter for orchestration already running inside db.transaction.
 * All nested services share the outer commit/rollback; this never opens a connection. */
export function transactionScope(tx) {
  const scoped=Object.create(tx);
  scoped.transaction=async work=>work(scoped);
  return scoped;
}
