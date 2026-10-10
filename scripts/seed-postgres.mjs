/**
 * Fresh PostgreSQL seed for production / staging.
 * Usage:
 *   DATABASE_URL=... ADMIN_USERNAME=admin ADMIN_PASSWORD='StrongPass!' node scripts/seed-postgres.mjs
 */
import pg from 'pg';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//i.test(url)) {
  console.error('Set DATABASE_URL=postgresql://user:pass@host:5432/dbname');
  process.exit(1);
}

const username = (process.env.ADMIN_USERNAME || 'admin').trim();
const password = process.env.ADMIN_PASSWORD || '';
const fullName = process.env.ADMIN_FULL_NAME || 'Administrator';
const shopName = process.env.SHOP_NAME || '99 Shop by Shahana';

if (password.length < 8) {
  console.error('ADMIN_PASSWORD must be at least 8 characters.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  const hash = bcrypt.hashSync(password, 12);

  await client.query(
    `INSERT INTO users (username, password_hash, full_name, role, is_active, must_change_password)
     VALUES ($1, $2, $3, 'admin', 1, 1)
     ON CONFLICT (username) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       full_name = EXCLUDED.full_name,
       must_change_password = 1,
       updated_at = CURRENT_TIMESTAMP`,
    [username, hash, fullName]
  );

  const settings = [
    ['shop_name', shopName],
    ['shop_address', process.env.SHOP_ADDRESS || 'Surkhet, Nepal'],
    ['shop_phone', process.env.SHOP_PHONE || '+977 976-7896814'],
    ['shop_email', process.env.SHOP_EMAIL || ''],
    ['vat_percentage', process.env.VAT_PERCENT || '0'],
    ['service_charge_percentage', process.env.SERVICE_PERCENT || '0'],
    ['currency', 'NPR'],
  ];

  for (const [key, value] of settings) {
    await client.query(
      `INSERT INTO system_settings (setting_key, setting_value)
       VALUES ($1, $2)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
  }

  console.log(`✓ Seeded admin user "${username}" (must change password on first login)`);
  console.log('✓ Seeded system settings');
} finally {
  await client.end();
}
