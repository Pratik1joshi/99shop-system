// Read-only operational measures. Claim documents are not financial transactions.
export async function afterSalesSummary(db,{viewCost=false}={}){
  const elapsed=db.driver==='postgres'?"EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP-created_at))/86400.0":"julianday('now')-julianday(created_at)";
  const resolutionTime=db.driver==='postgres'?"EXTRACT(EPOCH FROM (resolved_at-created_at))/86400.0":"julianday(resolved_at)-julianday(created_at)";
  const [statuses,open,resolved,outcomes,issues]=await Promise.all([
    db.all('SELECT status,COUNT(*) AS count FROM warranty_claims GROUP BY status'),
    db.get(`SELECT COUNT(*) AS count,AVG(${elapsed}) AS average_age_days FROM warranty_claims WHERE status NOT IN ('CLOSED','CANCELLED','RESOLVED')`),
    db.get(`SELECT COUNT(*) AS count,AVG(${resolutionTime}) AS average_resolution_days FROM warranty_claims WHERE resolved_at IS NOT NULL`),
    db.all('SELECT resolution,COUNT(*) AS count FROM warranty_claims WHERE resolution IS NOT NULL GROUP BY resolution'),
    db.all('SELECT issue,COUNT(*) AS count FROM warranty_claims GROUP BY issue ORDER BY COUNT(*) DESC LIMIT 20'),
  ]);
  return {period:'All recorded after-sales history',statuses,open,resolved,outcomes,issues,...(viewCost?{expense:await db.get('SELECT COALESCE(SUM(carrying_value),0) AS amount FROM warranty_economics')}: {})};
}
