/** Read-only checks after all mutations in the disposable browser fixture. */
import fs from 'node:fs';
import Database from '../lib/db/index.js';
import {runRetailReconciliation} from '../lib/retail-reconciliation.js';
import {trialBalance} from '../lib/accounting-reports.js';
const url=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/phase1f_browser_\d+_\d+$/.test(url.pathname))throw new Error('Disposable local browser fixture required.');
const db=Database.getInstance();
try{
  const reconciliation=await runRetailReconciliation(db);
  const trial=await trialBalance(db);
  const result={reconciliation,trial_balance:trial,bank_reconciliation:{status:'NOT_VERIFIED',reason:'No seeded bank statement/match acceptance fixture was executed.'},period_cross_module:{status:'NOT_VERIFIED',reason:'Full Overview/Insights/Reports/P&L/AR/AP/Inventory/Registers period proof remains.'}};
  fs.mkdirSync('.commerce-tmp/phase1g',{recursive:true});
  fs.writeFileSync('.commerce-tmp/phase1g/reconciliation.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({reconciled:reconciliation.reconciled,checks:reconciliation.checks.length,inventory_projection:reconciliation.inventoryProjection.reconciled,trial_balanced:trial.balanced,total_debit:trial.totalDebit,total_credit:trial.totalCredit}));
}finally{await db.close();}
