import { NextResponse } from 'next/server';
import Database from '@/lib/db/index';
import { requireAuth, handleRouteError } from '@/lib/api-guard.js';
import { ensureSqliteTable } from '@/lib/db/ensure-sqlite-table.js';
import { setCashClosingConfig } from '@/lib/cash-closing-policy.js';

async function ensureSystemSettingsTable(db) {
  // Postgres: table comes from the migrations — never run SQLite DDL.
  await ensureSqliteTable(
    db,
    `
    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `
  );
}

async function seedMissingDefaults(db) {
  // Insert missing keys as well as initializing a blank install. This matters
  // when a new setting is added after a shop is already in production.

  // Shop identity — used only when no settings exist yet. All values remain
  // editable in Settings; nothing here is hard-coded at billing time.
  const defaults = [
    // Tax defaults to 0% and is editable in Settings — no rate is assumed.
    { key: 'vat_percentage', value: '0' },
    { key: 'shop_name', value: '99 Shop by Shahana' },
    { key: 'shop_address', value: 'Surkhet, Nepal' },
    { key: 'shop_phone', value: '+977 976-7896814' },
    { key: 'shop_email', value: '' },
    { key: 'owner_name', value: '' },
    { key: 'vat_number', value: '' },
    { key: 'pan_number', value: '' },
    { key: 'bank_qr_image', value: '' },
    { key: 'esewa_qr_image', value: '' },
    { key: 'calendar_system', value: 'BS' },
    { key: 'cashier_expected_cash_schedule_enabled', value: 'true' },
    { key: 'cashier_expected_cash_reveal_time', value: '20:30' },
    { key: 'cashier_cash_count_schedule_enabled', value: 'false' },
    { key: 'cashier_cash_count_time', value: '14:00' },
  ];

  for (const setting of defaults) {
    await db.run(
      `
      INSERT INTO system_settings (setting_key, setting_value)
      VALUES (?, ?)
      ON CONFLICT (setting_key) DO NOTHING
    `,
      [setting.key, setting.value]
    );
  }
}

export async function GET(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'] });
    if (auth.error) return auth.error;

    const db = Database.getInstance();
    await ensureSystemSettingsTable(db);
    await seedMissingDefaults(db);

    const settingsArray = await db.all('SELECT setting_key, setting_value FROM system_settings');

    const settings = {};
    settingsArray.forEach((row) => {
      const key = row.setting_key;
      let value = row.setting_value;

      if (key === 'vat_percentage') {
        value = parseFloat(value) || 0;
      }

      settings[key] = value;
    });
    settings.calendar_system = ['AD', 'BS'].includes(String(settings.calendar_system || '').toUpperCase())
      ? String(settings.calendar_system).toUpperCase()
      : 'BS';

    return NextResponse.json({ settings });
  } catch (error) {
    return handleRouteError(error, 'Failed to fetch settings');
  }
}

export async function PUT(request) {
  try {
    const auth = await requireAuth(request, { roles: ['admin', 'cashier'], permission: 'settings.manage' });
    if (auth.error) return auth.error;

    const data = await request.json();
    const db = Database.getInstance();
    await ensureSystemSettingsTable(db);

    if (data.calendar_system != null && !['AD', 'BS'].includes(String(data.calendar_system).toUpperCase())) {
      return NextResponse.json({ error: 'Calendar system must be AD or BS.' }, { status: 400 });
    }
    if (data.cashier_expected_cash_reveal_time != null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(data.cashier_expected_cash_reveal_time))) {
      return NextResponse.json({ error: 'Cashier expected-cash reveal time must be a valid 24-hour time.' }, { status: 400 });
    }
    if (data.sale_void_window_minutes != null && !/^\d{1,4}$/.test(String(data.sale_void_window_minutes))) {
      return NextResponse.json({ error: 'Quick void window must be a whole number of minutes.' }, { status: 400 });
    }
    if (data.cashier_cash_count_time != null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(data.cashier_cash_count_time))) {
      return NextResponse.json({ error: 'Cashier cash-count time must be a valid 24-hour time.' }, { status: 400 });
    }
    const adminOnlyKeys = ['cashier_expected_cash_schedule_enabled', 'cashier_expected_cash_reveal_time', 'cashier_cash_count_schedule_enabled', 'cashier_cash_count_time', 'sale_void_window_minutes'];
    if (auth.user.role !== 'admin' && adminOnlyKeys.some((key) => key in data)) {
      return NextResponse.json({ error: 'Only an administrator can change protected operational controls.' }, { status: 403 });
    }

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && typeof value === 'object') continue;
      await db.run(
        `
        INSERT INTO system_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (setting_key) DO UPDATE SET
          setting_value = EXCLUDED.setting_value,
          updated_at = CURRENT_TIMESTAMP
      `,
        [key, key === 'calendar_system' ? String(value).toUpperCase() : value == null ? '' : String(value)]
      );
    }

    if ('cashier_expected_cash_schedule_enabled' in data || 'cashier_expected_cash_reveal_time' in data) {
      setCashClosingConfig({
        enabled: data.cashier_expected_cash_schedule_enabled,
        cutoff: data.cashier_expected_cash_reveal_time,
      });
    }

    return NextResponse.json({
      message: 'Settings updated successfully',
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to update settings');
  }
}
