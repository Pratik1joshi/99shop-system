import fs from 'node:fs';
import assert from 'node:assert/strict';
import Database from '../lib/db/index.js';
import {runRetailReconciliation} from '../lib/retail-reconciliation.js';
import {trialBalance} from '../lib/accounting-reports.js';
const url=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/phase2d_browser_'))throw new Error('Use the disposable Phase 2D browser database');
const db=Database.getInstance();
try{
  const reconciliation=await runRetailReconciliation(db),trial=await trialBalance(db);
  assert.equal(reconciliation.reconciled,true,JSON.stringify(reconciliation));
  assert.equal(trial.balanced,true);
  const evidence={reconciliation,trial_balance:trial};
  fs.writeFileSync('.commerce-tmp/phase2d/reconciliation.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence));
}finally{await db.close();}
