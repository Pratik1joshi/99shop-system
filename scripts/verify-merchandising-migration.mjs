import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
const url=new URL(process.env.TEST_DATABASE_URL||'');
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Use isolated local PostgreSQL');
const admin=new pg.Client({connectionString:url.href});await admin.connect();const checks=[];
try{
  for(const mode of ['fresh','upgrade']){
    const name=`phase2a_migration_${Date.now()}_${process.pid}`;await admin.query(`CREATE DATABASE "${name}"`);const target=new URL(url);target.pathname=`/${name}`;const db=new pg.Client({connectionString:target.href});await db.connect();
    try{
      for(const file of fs.readdirSync('migrations').filter(file=>/^\d+.*\.sql$/.test(file)&&Number(file.slice(0,3))<=103).sort())await db.query(fs.readFileSync(`migrations/${file}`,'utf8'));
      let baseline;
      if(mode==='upgrade'){
        const category=(await db.query("INSERT INTO product_categories(name) VALUES ('Upgrade catalog') RETURNING id")).rows[0].id;
        const product=(await db.query("INSERT INTO products(name,category_id,base_price,is_available) VALUES ('Preserved product',$1,100,1) RETURNING id",[category])).rows[0].id;
        baseline=(await db.query("INSERT INTO product_variants(product_id,variant_name,sku,price) VALUES ($1,'Ruby','PRESERVE-RUBY',100) RETURNING id,sku,price",[product])).rows[0];
      }
      const sql=fs.readFileSync('migrations/104_retail_merchandising_pricing.sql','utf8');await db.query(sql);await db.query(sql);
      if(baseline){assert.deepEqual((await db.query('SELECT id,sku,price FROM product_variants WHERE id=$1',[baseline.id])).rows[0],baseline);assert.equal((await db.query('SELECT online_enabled FROM products LIMIT 1')).rows[0].online_enabled,0);}
      assert.equal((await db.query('SELECT COUNT(*)::int count FROM journal_entries')).rows[0].count,0);
      assert.equal((await db.query('SELECT COUNT(*)::int count FROM retail_margin_policy')).rows[0].count,1);
      checks.push({mode,rerun:'PASS',identity_preserved:true,automatic_online_publication:false,accounting_unchanged:true});
    }finally{await db.end();await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);}
  }
}finally{await admin.end();}
fs.mkdirSync('.commerce-tmp/phase2a',{recursive:true});fs.writeFileSync('.commerce-tmp/phase2a/migrations.json',JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
