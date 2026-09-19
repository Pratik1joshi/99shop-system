# Dim Sum Puri production upgrade

This release upgrades the existing Dim Sum Puri installation in place. The PostgreSQL database is the source of truth. Do not replace it with a database from another restaurant.

## Files that must never be run against the live database

- `deploy/production_schema.sql`
- `deploy/default_seed.sql`
- `deploy/production_seed.sql`
- `deploy/production_seed_no_admin.sql`
- `deploy/menu_seed.sql`
- `deploy/reset_and_retable_2026-08-13.sql`
- any import, reset, clear, or demo-data script

Only `npm run db:migrate` is approved for upgrading the existing database. Migrations are additive, transactional, recorded in `schema_migrations`, and protected by a PostgreSQL advisory lock.

## Expected pending migrations for the current Dim Sum Puri production lineage

Always treat `npm run db:plan` as the source of truth for the actual server. If
production currently has the migrations from the former `app` release through
`050_channel_document_numbers`, the expected pending files are:

- `045_hrm.sql`
- `046_channel_document_numbers.sql`
- `047_correction_source_state.sql`
- `048_promotions.sql`
- `049_combo_packs.sql`
- `050_combo_order_snapshot.sql`
- `051_advanced_promotions.sql`
- `052_dim_sum_puri_feature_bridge.sql`
- `053_dim_sum_puri_production_hardening.sql`
- `054_dim_sum_puri_savings_schema_bridge.sql`
- `055_dim_sum_puri_brand_identity.sql`
- `056_dim_sum_puri_hrm_schema_bridge.sql`
- `057_business_funding_account.sql`

The repeated-looking numbers are intentional: the two development lineages used
different full migration filenames, and `schema_migrations.version` stores those
full names. Migrations `052`–`054` are idempotent compatibility passes for the
existing Dim Sum Puri schema. Migration `056` copies existing `hr_*` staff,
attendance, and holiday records into the newer HRM shape while preserving ids;
it does not drop the legacy tables. Migration `057` adds the permanent Business
Funding asset account and its owner-investment audit table; it does not alter or
backfill existing cash, bank, purchase, expense, or equity balances. Do not
manually mark migrations as applied
and do not run individual SQL files out of order.

## Values to prepare

Set these in the SSH session without writing the password into shell history. Use the database-owner connection for migration if the normal application user cannot alter tables.

```bash
export RELEASE_DIR=/srv/dim-sum-puri/releases/NEW_RELEASE
export SHARED_DIR=/srv/dim-sum-puri/shared
export BACKUP_DIR=/srv/dim-sum-puri/backups
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE'
umask 077
mkdir -p "$BACKUP_DIR"
```

Replace the example paths with the server's actual paths. Preserve the production `.env` file and persistent uploads/media directory; do not copy Raithane credentials or uploads into production.

## Mandatory rehearsal on a restored database

Do this before the restaurant cutover. It proves the real month of data can be upgraded safely.

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
pg_dump "$DATABASE_URL" --format=custom --no-owner --file="$BACKUP_DIR/dimsumpuri-rehearsal-$STAMP.dump"
pg_restore --list "$BACKUP_DIR/dimsumpuri-rehearsal-$STAMP.dump" >/dev/null
```

Create a separate staging database, restore the dump into it, then set `DATABASE_URL` to the staging database. Never rehearse against production.

```bash
cd "$RELEASE_DIR"
npm ci
npm run db:plan
npm run db:snapshot -- --output=staging-before.json
npm run db:migrate
npm run db:snapshot -- --output=staging-after.json
npm run db:compare -- staging-before.json staging-after.json
npm run test:unit
npm run build
```

Start the staging app and test at least:

- admin login and permissions
- dashboard totals and historical orders
- POS: open order, KOT, bill, payment, receipt/reprint
- inventory, purchase receiving, suppliers, and recipes
- expenses, cash/bank, reconciliation, savings, and reports
- Business Funding: add a dated test investment; verify a cash/bank-short purchase
  asks before using it; edit that purchase and confirm the funding transfer is replaced
- waiter, kitchen, cashier, delivery, reservations, and online ordering
- public menu, gallery, contact details, logo, images, and WhatsApp link

The snapshot comparison must say that data counts and financial aggregates match. Resolve every unexplained mismatch before production.

## Production cutover

1. Finish or record any active tables/orders and stop new orders.
2. Stop every app instance, worker, and scheduled task that can write to PostgreSQL.
3. Confirm no staff device can continue writing.
4. Take and verify the final backup:

```bash
STAMP=$(date +%Y%m%d-%H%M%S)
pg_dump "$DATABASE_URL" --format=custom --no-owner --file="$BACKUP_DIR/dimsumpuri-pre-upgrade-$STAMP.dump"
pg_restore --list "$BACKUP_DIR/dimsumpuri-pre-upgrade-$STAMP.dump" >/dev/null
cd "$RELEASE_DIR"
npm run db:snapshot -- --output="production-before-$STAMP.json"
```

5. Deploy this release while retaining production environment variables and persistent uploads.
6. Install and build before touching the database:

```bash
npm ci
npm run test:unit
npm run build
npm run db:plan
```

7. Read the pending migration list. If it contains a seed/reset script or anything unexpected, stop.
8. Apply migrations once, then prove the business data fingerprint is unchanged:

```bash
npm run db:migrate
npm run db:snapshot -- --output="production-after-$STAMP.json"
npm run db:compare -- "production-before-$STAMP.json" "production-after-$STAMP.json"
```

9. Start one application instance. Check `/api/health`, login, historical totals, the latest real order/bill, menu images, and perform one clearly identified test transaction if operations allow it.
10. Start remaining instances and reopen staff access only after checks pass.

Keep the dump, both JSON snapshots, application logs, and deployed release identifier together as the upgrade record. Snapshot JSON contains aggregates, not customer-level data, but should still be stored privately.

## Rollback

If the app fails but migrations completed, stop the new app and switch back to the previous code release. The database changes are additive so the previous app can continue using its existing columns.

If database verification fails, keep all writers stopped. Do not restore over the damaged/live database. Create a fresh database, restore the verified pre-upgrade dump into it, validate it, and switch `DATABASE_URL` to that restored database. Preserve the failed database for diagnosis.

Do not attempt a database restore after new real orders have been accepted without first reconciling those new transactions; otherwise those orders will be lost.
