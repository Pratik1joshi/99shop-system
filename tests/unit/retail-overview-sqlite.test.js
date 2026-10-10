import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let sequence=0;
const makeDb=()=>{const file=path.join(os.tmpdir(),`overview-upgrade-${process.pid}-${Date.now()}-${sequence++}.db`);return {db:new PosDatabase(file),file};};
const clean=async(db,file)=>{await db.close();for(const suffix of ['', '-wal','-shm'])fs.rmSync(file+suffix,{force:true});};
import assert from 'node:assert/strict';
import { PosDatabase } from '../../lib/db/index.js';
import { getRetailOverview } from '../../lib/retail-overview.js';
import { retailChannelReport } from '../../lib/retail-analytics.js';
import { ensureColumn, columnExists } from '../../lib/db/schema-helpers.js';

test('cold SQLite dashboard upgrades online orders before concurrent readers', async()=>{
  const {db,file}=makeDb();
  try {
    assert.equal(await columnExists(db,'retail_online_orders','reservation_expires_at'),false);
    const [first,second]=await Promise.all([getRetailOverview(db),getRetailOverview(db)]);
    assert.ok(first.metrics.length>0);assert.equal(first.businessDate,second.businessDate);
    assert.equal(await columnExists(db,'retail_online_orders','reservation_expires_at'),true);
    assert.ok(Array.isArray((await retailChannelReport(db)).orders));
  } finally {await clean(db,file);}
});

test('concurrent SQLite column upgrades are idempotent and silent',async()=>{
  const {db,file}=makeDb();
  const warnings=[],original=console.warn;console.warn=(...args)=>warnings.push(args);
  try {
    await db.run('CREATE TABLE schema_race (id INTEGER)');
    const results=await Promise.all(Array.from({length:8},()=>ensureColumn(db,'schema_race','extra','TEXT')));
    assert.equal(results.filter(Boolean).length,1);
    assert.equal(await columnExists(db,'schema_race','extra'),true);
    assert.equal(warnings.length,0);
  }finally{console.warn=original;await clean(db,file);}
});
