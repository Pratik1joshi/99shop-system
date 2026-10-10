import pg from 'pg';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const url=new URL(process.env.TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Isolated localhost PostgreSQL required.');
const admin=new pg.Client({connectionString:url.href});await admin.connect();
const checks=[];
const run=(script,target)=>{const r=spawnSync(process.execPath,[script],{env:{...process.env,DATABASE_URL:target.href,ADMIN_PASSWORD:'KmTestOnly123'},stdio:'inherit'});if(r.status!==0)throw new Error(`${script} failed`);};
try{
  for(const mode of ['fresh','upgrade']){
    const name=`phase1g_migration_${mode}_${Date.now()}_${process.pid}`,target=new URL(url);target.pathname=`/${name}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    const client=new pg.Client({connectionString:target.href});await client.connect();
    try{
      let baseline=null;
      if(mode==='upgrade'){
        await client.query('CREATE TABLE schema_migrations(id SERIAL PRIMARY KEY,version TEXT UNIQUE NOT NULL,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
        for(const file of fs.readdirSync('migrations').filter(f=>/^\d+.*\.sql$/.test(f)&&Number(f.slice(0,3))<=98).sort()){
          await client.query('BEGIN');await client.query(fs.readFileSync(`migrations/${file}`,'utf8'));await client.query('INSERT INTO schema_migrations(version) VALUES ($1)',[file.replace(/\.sql$/,'')]);await client.query('COMMIT');
        }
        run('scripts/seed-postgres.mjs',target);
        baseline=(await client.query("INSERT INTO customers(name,phone,notes,credit_limit) VALUES ('Upgrade evidence','9800010101','Preserve existing private data',1250) RETURNING *")).rows[0];
      }
      run('scripts/migrate.mjs',target);run('scripts/seed-postgres.mjs',target);
      const before=(await client.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n;
      run('scripts/migrate.mjs',target);
      const after=(await client.query('SELECT count(*)::int n FROM schema_migrations')).rows[0].n;
      if(before!==after)throw new Error('Migration rerun changed version count');
      if(baseline){const row=(await client.query('SELECT * FROM customers WHERE id=$1',[baseline.id])).rows[0];if(JSON.stringify(row)!==JSON.stringify(baseline))throw new Error('Upgrade changed existing customer evidence');}
      for(const table of ['customer_master_audit','expense_change_audit','cash_variance_reviews'])await client.query(`SELECT * FROM ${table} LIMIT 1`);
      checks.push({mode,status:'PASS',migrations:after,upgrade_from:mode==='upgrade'?'098':null,existing_customer_preserved:!!baseline});
    }finally{await client.end();await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);}
  }
}finally{fs.mkdirSync('.commerce-tmp/phase1g',{recursive:true});fs.writeFileSync('.commerce-tmp/phase1g/migrations.json',JSON.stringify({checks},null,2));await admin.end();}
