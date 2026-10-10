import pg from 'pg';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const url=new URL(process.env.TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Disposable local PostgreSQL required');
const admin=new pg.Client({connectionString:url.href});await admin.connect();const checks=[];
fs.mkdirSync('.commerce-tmp/phase2d',{recursive:true});
try{for(const mode of ['upgrade','browser']){
  const name=`phase2d_${mode}_${Date.now()}_${process.pid}`;await admin.query(`CREATE DATABASE "${name}"`);
  const target=new URL(url);target.pathname='/'+name;const client=new pg.Client({connectionString:target.href});await client.connect();
  const run=script=>{const result=spawnSync(process.execPath,['--import','./tests/unit/loader-register.mjs',script],{stdio:'inherit',env:{...process.env,DATABASE_URL:target.href,ADMIN_PASSWORD:'KmTestOnly123',SKIP_DB_ON_BUILD:''}});if(result.status!==0)throw new Error(script+' failed');};
  try{
    let original;
    if(mode==='upgrade'){
      await client.query('CREATE TABLE schema_migrations(id SERIAL PRIMARY KEY,version TEXT UNIQUE NOT NULL,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
      for(const file of fs.readdirSync('migrations').filter(f=>/^\d+.*\.sql$/.test(f)&&Number(f.slice(0,3))<=108).sort()){
        await client.query(fs.readFileSync('migrations/'+file,'utf8'));await client.query('INSERT INTO schema_migrations(version) VALUES ($1)',[file.replace(/\.sql$/,'')]);
      }
      const category=(await client.query("INSERT INTO product_categories(name) VALUES ('Preserved Phase 2B category') RETURNING id")).rows[0].id;
      original=(await client.query("INSERT INTO products(name,category_id,base_price,is_available) VALUES ('Preserved Phase 2B product',$1,123.45,1) RETURNING id,name,base_price,online_enabled",[category])).rows[0];
    }
    run('scripts/migrate.mjs');run('scripts/migrate.mjs');
    if(original)assert.deepEqual((await client.query('SELECT id,name,base_price,online_enabled FROM products WHERE id=$1',[original.id])).rows[0],original);
    assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM journal_entries')).rows[0].n,0);
    assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM warranty_snapshots')).rows[0].n,0);
    checks.push({mode:mode==='upgrade'?'upgrade_from_108':'fresh',rerun:'PASS',no_retroactive_promises:true,economics_unchanged:true,migration_files:(await client.query('SELECT COUNT(*)::int AS n FROM schema_migrations')).rows[0].n});
    if(mode==='browser'){run('scripts/seed-postgres.mjs');run('scripts/seed-phase2d-browser.mjs');fs.writeFileSync('.commerce-tmp/phase2d/browser.env',`DATABASE_URL=${target.href}\nE2E_ADMIN_PIN=KmTestOnly123\n`);}
  }finally{await client.end();if(mode!=='browser')await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);}
}}finally{await admin.end();fs.writeFileSync('.commerce-tmp/phase2d/migrations.json',JSON.stringify(checks,null,2));}
console.log(JSON.stringify(checks));
