# 99 Shop by Shahana — retail POS

Point of sale, stock and accounting for a cosmetics and accessories shop in
Surkhet, plus the shop's public storefront. Next.js (App Router) with
PostgreSQL in production and SQLite for local development.

This codebase began as a restaurant POS. The accounting, inventory, billing and
reporting engine is trade-agnostic and stays; the dine-in workflow — waiters,
kitchen tickets, tables, reservations — has been removed. `lib/deployment.js`
is the single place that records the deployment profile.

## What is in it

| Surface | Route | Purpose |
| --- | --- | --- |
| Storefront | `/`, `/shop/<category>`, `/about` | Public catalogue, reads live products; orders go to WhatsApp |
| Till | `/admin/pos`, `/cashier/pos` | Scan or search, cart, discounts, split payment, receipt |
| Products | `/admin/products` | Add by camera scan, USB scanner or by hand; variants and barcodes |
| Back office | `/admin/*` | Inventory, purchases, suppliers, expenses, payroll, HRM |
| Accounting | `/admin/general-ledger` and friends | Double-entry journal; every figure is derived, none stored |
| Reports | `/admin/reports`, `/admin/analytics` | Sales, finance, inventory, staff, cancellations |

## Quick start

```bash
npm install
npm run dev          # http://localhost:3003
```

With no `DATABASE_URL` set, the app opens `shop99.db` in the project root
(falling back to an existing `pos_restaurant.db` from before the conversion).
For PostgreSQL:

```bash
DATABASE_URL=postgres://… npm run db:pg:init   # migrate + seed
```

## Adding a product

Either route ends at the same record:

- **Scan** — *Scan to add* on the products screen opens the camera. A barcode
  already in the catalogue opens that product for editing; an unknown one
  starts a new product with the code filled in.
- **By hand** — *Add product* opens the form. *Generate* mints an in-house
  barcode for stock that arrived without one, ready to print from
  *Barcode Labels*.

A USB scanner needs no setup anywhere: it types into the focused search or
barcode box like a keyboard.

## Storefront

`app/(store)` renders the public site from `menu_categories` and `menu_items`,
so a product added at the till appears on the website on the next request. A
category page exists for every active category that has something in stock;
empty categories 404 rather than showing a bare page. Product photos come from
`image_url`, falling back to the shipped images in `public/storefront/`.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Development server on port 3003 |
| `npm run build` / `npm start` | Production build, then the custom `server.js` |
| `npm run db:migrate` | Apply `migrations/*.sql` in order |
| `npm run db:seed` | Seed PostgreSQL |
| `npm run test:unit` | Unit tests |
| `npm run test:e2e` | Playwright tests |
| `npm run health` | Health check against a running server |

## Documentation

`docs/` holds the schema, business logic, API reference and deployment guides.
