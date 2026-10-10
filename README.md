# 99 Shop by Shahana — retail ERP

Billing, stock, purchasing, customers, finance and accounting for a cosmetics
and accessories shop in Surkhet, plus the shop's public storefront. Next.js
(App Router) with PostgreSQL in production and SQLite for local development.
See [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) for every module.

## What is in it

| Surface | Route | Purpose |
| --- | --- | --- |
| Storefront | `/`, `/shop/<category>`, `/about` | Public catalog, reads live products |
| Billing | `/admin/billing`, `/cashier/billing` | Scan or search, cart, discounts, split payment, receipt |
| Products | `/admin/products` | Add by camera scan, USB scanner or by hand; variants and barcodes |
| Website | `/admin/website` | Edit every word of the storefront: hero, order steps, About, footer, shop identity |
| Back office | `/admin/*` | Inventory, purchasing, customers, expenses, payroll, HRM |
| Accounting | `/admin/general-ledger` and friends | Double-entry journal; every figure is derived, none stored |
| Reports | `/admin/reports`, `/admin/retail-analytics` | Sales, finance, inventory, products, staff, returns |

## Quick start

```bash
npm install
npm run dev          # http://localhost:3003
```

With no `DATABASE_URL` set, the app opens `shop99.db` in the project root and
creates it on first run with an admin (PIN `123456`) and a cashier
(PIN `7890`). Change both PINs after the first login. For PostgreSQL:

```bash
DATABASE_URL=postgres://… npm run db:pg:init   # migrate + seed
```

## Adding a product

Either route ends at the same record:

- **Scan** — *Scan to add* on the products screen opens the camera. A barcode
  already in the catalog opens that product for editing; an unknown one
  starts a new product with the code filled in.
- **By hand** — *Add product* opens the form. *Generate* mints an in-house
  barcode for stock that arrived without one, ready to print from
  *Barcode Labels*.

A USB scanner needs no setup anywhere: it types into the focused search or
barcode box like a keyboard.

## Storefront

`app/(store)` renders the public site from `product_categories` and
`products`, so a product added in the back office appears on the website on
the next request. A category page exists for every active category that has
something in stock; empty categories 404 rather than showing a bare page.
Product photos come from `image_url`, falling back to the shipped images in
`public/storefront/`.

Everything the site says that is *not* a product — hero, the three order
steps, category invitations, the About story, footer, and the shop's name,
phone, WhatsApp number and socials — is edited at **`/admin/website`** and
stored in `site_content`. `lib/site-content.js` holds the shipped wording as
defaults, so an empty table renders the original site and clearing a field
restores it instead of leaving a gap.

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

`docs/` holds the security notes, deployment guides, SEO guides and the retail
build records; [`deploy/INSTALL.md`](deploy/INSTALL.md) is the production
install guide.
