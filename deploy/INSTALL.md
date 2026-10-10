# 99 Shop: cPanel and PostgreSQL deployment

This is the current install path for a **fresh** database. It requires a cPanel
host that provides a Node.js application service and PostgreSQL. Use a dedicated
domain or subdomain, not a URL subpath. The application needs a long-running
Node.js process; uploading files to `public_html` alone will not run it.

## Before installation

- Select Node.js 22 and create a PostgreSQL database and user. Grant that user
  access to its database. The host may provide cPanel Application Manager or
  CloudLinux Setup Node.js App; their setup screens differ.
- Put the project outside `public_html`. Keep a separate persistent upload
  directory writable by the application user.
- Use a UTF-8 PostgreSQL database. Back up both PostgreSQL and uploads before
  every update.
- Run `npm ci` with the selected Node.js 22 environment.

## Configure

Set production variables in the host's application settings using
[`.env.example`](../.env.example) as a checklist. Required values are
`NODE_ENV=production`, `APP_URL`, `NEXT_PUBLIC_SITE_URL`, `DATABASE_URL`,
`SESSION_SECRET`, `CSRF_SECRET`, `FORCE_SECURE_COOKIES=1`, and an absolute
`UPLOADS_DIR` outside the release directory. Set `PGSSL` to match the database
connection. URL-encode special characters in the database password. The host
normally supplies `PORT`; do not hard-code it.

`NEXT_PUBLIC_SITE_URL` is embedded at build time. Set it to the final HTTPS
origin **before** running `npm run build`.

## Fresh database

The ordered SQL files in `migrations/` are the schema source of truth. Do not
load the old `deploy/production_schema.sql` or `deploy/production_seed.sql`:
those are restaurant-era snapshots with old defaults and migration levels.

```bash
npm run db:migrate
npm run db:plan
ADMIN_USERNAME=admin ADMIN_PASSWORD='a-unique-strong-password' npm run db:seed
npm run build
```

`db:plan` must report zero pending migrations. Seed only a fresh database.
After first login, change the initial admin password and complete business
settings. The seed does not create demo products, stock, or sales.

To add the two selected storefront products and their colour/size options to a
fresh database, run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/basic_shop_seed.sql`
after the commands above. This optional SQL seed is safe to rerun and does not
create stock. Receive or count your actual stock in the app before accepting
online orders.

## Run and verify

Set the startup file to `server.js` and application mode to Production. Start or
restart the Node.js application in the host panel. Verify:

1. `GET /api/health` reports a healthy database.
2. The public home, About, and category pages load over HTTPS.
3. Admin login and Website CMS save/preview work.
4. A product with a variant can be sold, received, and reported on using a
   staging database before taking real orders.
5. Uploaded images survive a restart and a release update.

## Updating an existing installation

Back up the database and uploads, then deploy the new files. Run `npm ci`,
`npm run db:plan`, `npm run db:migrate`, `npm run db:plan` (zero pending), and
`npm run build`; restart the application and repeat the health and smoke checks.
Do not run `db:seed` on a live database: it updates the admin credentials.

The migration runner is transactional per file and records applied versions in
`schema_migrations`. The application does not run migrations automatically on
startup. A backup and a staging rehearsal are required before a production
schema update. Restore-test the database and upload backups periodically.
