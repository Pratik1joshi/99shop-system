# 99 Shop Documentation

Documentation for the 99 Shop retail ERP and storefront. The application is
built with Next.js 16 and React 19, uses PostgreSQL in production, and uses
SQLite for local development. Start with the
[system overview](../SYSTEM_OVERVIEW.md).

## Start here

| Document | Purpose |
|---|---|
| [System overview](../SYSTEM_OVERVIEW.md) | Every module, its pages and the tables behind it |
| [TRD](TRD.md) | Architecture, runtime, modules, and engineering constraints |
| [Security](SECURITY.md) | Authentication, authorization, secrets, and hardening |
| [Deployment guide](DEPLOYMENT_GUIDE.md) | Local and cPanel/PostgreSQL deployment |
| [Production install](../deploy/INSTALL.md) | The operational source of truth for installs and updates |
| [Inventory monetary policy](INVENTORY_MONETARY_POLICY.md) | How stock is valued and reconciled to the ledger |
| [Retail canonical ownership](RETAIL_CANONICAL_OWNERSHIP.md) | Which table and module owns each business figure |
| [SEO owner guide](SEO_OWNER_GUIDE.md) | Keeping the storefront findable |

## Build records

The `RETAIL_*` and `PHASE_*` documents record how the retail modules were
built and verified, with their evidence files. They describe the state at the
time of writing.

## Documentation rules

- Update the relevant document in the same change as code, schema, configuration, or workflow changes.
- Treat `migrations/` as the database implementation source of truth.
- Treat `app/api/**/route.js` as the API implementation source of truth.
- Never place passwords, tokens, production URLs, customer data, or database dumps in documentation.
- Dates use ISO format (`YYYY-MM-DD`), amounts are stored as numeric values, and the application displays Nepalese rupees.

Last reviewed: 2026-10-11.
