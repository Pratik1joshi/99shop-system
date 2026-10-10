/** Creates and removes only its own disposable PostgreSQL database on localhost. */
import pg from 'pg';
import { spawnSync } from 'node:child_process';
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to an isolated local PostgreSQL server; this test never runs against production.');
}
const url = new URL(process.env.TEST_DATABASE_URL);
if (!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw new Error('TEST_DATABASE_URL must point to an isolated local PostgreSQL test server.');
const client = new pg.Client({connectionString:url.href});
await client.connect();
try {
  const files = ['tests/integration/phase06-foundation.test.js', 'tests/integration/commerce-search.test.js', 'tests/unit/retail-economic-behavior.test.js', 'tests/integration/customer-timeline.test.js', 'tests/integration/phase1g-shared.test.js', 'tests/integration/serial-return-integrity.test.js', 'tests/integration/inventory-monetary.test.js', 'tests/integration/retail-pricing.test.js', 'tests/integration/retail-merchandising.test.js', 'tests/integration/catalog-performance.test.js', 'tests/integration/retail-public-commerce.test.js', 'tests/integration/public-catalog-performance.test.js'];
  files.push('tests/integration/retail-phase2d.test.js');
  const selected = process.argv.slice(2);
  if (selected.some(file => !files.includes(file))) throw new Error('Choose a registered integration suite');
  if (selected.length) files.splice(0,files.length,...selected);
  for (let index = 0; index < files.length; index += 1) {
    const name = `km_test_${Date.now()}_${process.pid}`;
    let created = false;
    try {
      await client.query(`CREATE DATABASE "${name}" TEMPLATE template0 ENCODING 'UTF8'`); created = true;
      const target=new URL(url);target.pathname=`/${name}`;
      const env={...process.env,DATABASE_URL:target.href,ADMIN_PASSWORD:'KmTestOnly123',SHOP_NAME:'99 Shop by Shahana',SKIP_DB_ON_BUILD:''};
      const run=(args)=>{ const r=spawnSync(process.execPath,args,{env,stdio:'inherit'});if(r.status!==0)throw new Error(`Validation failed (${r.status}): ${args.join(' ')}`); };
      run(['scripts/migrate.mjs']);run(['scripts/seed-postgres.mjs']);
      run(['--import','./tests/unit/loader-register.mjs','--test',files[index]]);
    } finally {
      if(created)await client.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
  }
} finally {
  await client.end();
}
