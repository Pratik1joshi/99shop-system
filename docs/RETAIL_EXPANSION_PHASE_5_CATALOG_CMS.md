# Retail expansion phase 5: catalog fixes, catalog UX and website CMS (2026-09-28)

## Errors fixed

Reported on a local SQLite database: `POST /api/admin/commerce/catalog-setup` failed with "no such column: online_filter"; Online store showed "Could not load storefront settings"; Merchandising showed "Could not load merchandising".

**Cause.** The catalog, pricing and online-store schema came only from PostgreSQL migrations `104`–`107`. SQLite databases never ran them, and nothing created those tables or columns there. The code also used PostgreSQL-only SQL.

**Fix.**
- `lib/retail-commerce-schema.js#ensureRetailCommerceSchema` mirrors migrations 104–107 for SQLite. It runs once per database, is a no-op on PostgreSQL, and skips the PostgreSQL GIN indexes. Every `/api/admin/commerce/*` handler calls it after authorization. It first runs the existing variant, catalog and pricing guards; product search failed on a fresh DB because `menu_item_variants.price` did not exist yet.
- Five unguarded `FOR UPDATE` clauses now use the repo's existing `driver === 'postgres'` pattern: storefront settings save, public order payment, publishing, re-quote, and account activation.
- Public catalog search keeps the PostgreSQL full-text query. On SQLite it uses `LIKE`, and filter facets use a window function instead of `LATERAL`.
- New test in `tests/unit/retail-economic-behavior.test.js`: on SQLite the schema exists, settings have defaults, and `publicCatalog` finds a published product by its online title with correct availability.

## Catalog screens redesigned

All pages use the 99 Shop admin look: header band with icon, rounded cards, gray-900 buttons, toggles and plain-language help. Shared pieces live in `components/commerce/catalog-ui.jsx`: `PageHeader`, `Panel`, `Field`, `Toggle`, `SearchPicker` and `ImageUploadButton`. API payloads are unchanged unless noted.

| Page | Before | Now |
| --- | --- | --- |
| Barcode labels | Unstyled search, table, and the full label sheet on screen. One product without a barcode blocked the whole batch. | Three steps: choose products, set counts (−/+, All to 1, Match stock), choose layout and print. Products without a barcode are flagged and skipped. One live preview label; the full sheet renders only when printing. Shop name, SKU and MRP toggles. |
| Attributes & brands | Three stacked tables. Attribute values typed as `name \| code \| #hex` lines. | Tabs with counts; cards with value chips and colour swatches. Row editor for values with a colour picker. Saved values are locked, because the server keeps value identity. Toggles for online filter, active and online category. |
| Pricing | Empty tables, "Schedules use UTC", customer picked by raw ID, saved margin policy never shown. | "How a price is chosen" strip; price lists as cards; start and end in local time, converted to UTC; code generated from the name; per-rule Rs or % toggle; customer groups with a customer search; current margin policy shown (the GET now returns it); readable change history. |
| Bulk price change | Category and supplier shown as `#id`. | Three steps (which products, what change, check) with names, rounding choices and an old-to-new price list before confirming. |
| Merchandising | One long unstyled strip; `Shade: Ruby, Rose` textarea; Tracking and Active edited as free text. | Product picker with guidance cards; tabs Variants & prices, Create variants, Online/images/suppliers. Attribute rows with a SKU prefix taken from the product name (the server requires one). Grid has a tracking dropdown and a Selling checkbox; sticky "Review changes" bar; readable preview. |
| Online store | One long form, logo typed as a path, customer chosen by ID. | Big ON/OFF card; panels for look, ordering and payments; colour picker; logo upload; delivery fields appear only when delivery is on; product publishing with chips; customer search with a copyable one-time code. |
| Products | Filter labels and a DataTable; list failed on a fresh SQLite DB. | Search bar and compact filters; product rows with image, category, stock badge and price. Broken images fall back to an icon. |

The shared `.commerce-form` CSS now uses the 99 Shop input style, so the product edit drawer matches. Scheduling selected prices uses local time instead of UTC.

## Website CMS

- Linked in the sidebar: Admin → Website; cashiers with `cms.manage` → Website.
- New Logo field (`shop.logo`) with upload. The header, home page and About page use it and fall back to the shipped logo. Image values must be an uploaded `/uploads/menu/…`, `/api/media/…` or `/storefront/…` path, or an `https://` link. All image values are checked before anything is written, so a bad value cannot cause a half-saved update (`tests/unit/site-content.test.js`).
- Editor shows unsaved-change counts per section and warns before leaving the page. It saves only changed fields.
- Live preview (screens 1536 px and wider): the page for the current section in an iframe, with desktop and phone widths, reloaded after save. Framing is same-origin and allowed by the existing CSP `frame-ancestors 'self'`.

## Verification

- `npm run test:unit`: 367 passed. ESLint clean on changed files. `next build --webpack` compiled.
- Chrome against a fresh SQLite database:
  - Every catalog page loads without API errors.
  - Attribute with two values and a brand are created; a price list is created from a product search; margin policy is set and shown.
  - Bulk price change on Desserts is previewed and applied.
  - Coffee gets Pink and Black variants with generated SKUs and internal barcodes, and they save.
  - Print labels opens with a CODE128 preview and "Print 2 labels".
  - Online store is switched on, a product is published, and the public catalog API returns 200.
  - A website headline edit is saved and appears in the live preview.
  - The Products list renders.
  - The flow asserts the stylesheet actually loaded.
  - Earlier suites still pass: sidebar, billing, reminders, surfaced pages, held-sale resume.
- A test-environment issue was found and fixed: running Playwright with `TEMP` inside the project put Chrome's profile under `.tmp/`. Tailwind v4 scanned it, hit a locked file and crashed the CSS build (the pages rendered unstyled). Browser checks now use a temp folder outside the project.

## Remaining

- Per-category images on the website are still fixed in `lib/storefront.js`.
- Demo seed products point at `.svg` images that do not exist; they show the placeholder icon.
- The drawer for editing one product (variants fieldsets) was restyled through CSS only; its layout is unchanged.

## Follow-up 2026-09-29: Products is the one place

Owner feedback: product, variant, barcode and pricing work was spread over eight Catalog pages, and it was unclear where to go. Printing a sticker for a new product required a detour to create a barcode first.

- **Menu:** Catalog is now Products, Categories & brands, Offers & bundles and Special prices. Online store moved next to Website. Barcode labels and the bulk editor (Merchandising) open from Products, so they no longer have menu entries. The legacy 99 Shop categories page is no longer linked.
- **Products:**
  - Tick products (or "Select all on this page") and press **Print labels**; each row also has its own print button.
  - One editor holds photo, name, category, brand and the "For sale" switch, plus price, MRP, barcode, SKU and stock.
  - **Add colours or sizes** (type `Pink, Black`) creates the versions on the spot. "More details" holds wholesale price, reorder levels, tracking, extra barcodes, history and a link to the bulk editor.
  - After saving, Print labels is one click away.
- **Barcodes always exist:**
  - A new product or new version without a typed barcode gets the shop's own `INT-` code.
  - Existing versions can get or replace a barcode in the editor; changes are checked against other products.
  - The labels page now reads the product barcode for single-version products. This was the cause of "No barcode — cannot print".
  - Old products without codes get them from "Create barcodes for them" on the labels page (`POST /api/admin/commerce/labels`, `assign_missing`).
- Verified in Chrome: add a product with only a name and price, add Pink and Black, save (three versions, each with a barcode), then "Print 3 labels". Ticking two older products and printing works after one "Create barcodes" click. Unit tests: 367 passed; build compiled.

## Follow-up 2026-09-29 (2): bulk upload, wider Add product, special prices on the product

- **Add product** opens wide. The barcode field already holds a new `INT-` code; "New code" makes another. Clicking the box selects it, so a scanner replaces it, and the scanner's Enter does not submit the form. Brand is offered from the saved brands.
- **Bulk upload** (Products → Bulk upload):
  - Download a sample CSV (`PRODUCT_CSV_SAMPLE` in `lib/retail-catalog-matrix.js`), fill it in, upload it, check, import.
  - Columns: `name`, `price` (required), `category`, `brand`, `mrp`, `barcode`, `sku`, `colour`, `size`, `wholesale_price`, `description`. Rows with the same name become one product; colour and size make its versions.
  - `lib/retail-product-import.js` + `POST /api/admin/commerce/products/import` (`menu.manage`). Without `confirm` it only checks and writes nothing. With `confirm: true` it checks again inside one transaction under the catalog lock, and any problem cancels the whole upload.
  - Missing barcodes get `INT-` codes. Unknown categories are created. Products whose name already exists are skipped, never changed.
  - Every problem is reported by row: empty or invalid price, duplicate or taken barcode/SKU, a barcode Excel turned into `8.9E+12`, repeated rows without a colour or size.
  - The success screen links to Print labels for the new versions.
  - Stock is not imported; it is received in Inventory so cost and journals post through the normal path.
- **Special prices on the product:**
  - Wholesale price per version moved here from More details.
  - The product's sale and buy-more prices from every price list are listed with On now / Starts / Ended.
  - "Add a sale or buy-more price" takes Rs or % off, dates (whole local days) and a minimum quantity, for all versions or one. It saves a one-product price list (`SALE-P<id>-…`) through the existing pricing API, so Billing, labels and the online store pick it up. Those lists can be stopped from the product; others link to Special prices.
  - `GET /api/admin/commerce/pricing?product_id=` returns the rules.
- **Colour and size lists:** "Add colours or sizes" has two rows (default Colour and Size) and builds every combination (Blue, Red × M, L = 4 versions). Saved list values appear as tap-to-add chips; "Edit saved lists" opens Categories & brands on that tab (`?tab=attributes`).
- "Edit many versions in a grid" opens the bulk editor on this product (`?product=`).
- Client barcode and code generation uses `crypto.getRandomValues`, because `crypto.randomUUID` does not exist on plain-HTTP LAN tills.
- Verified:
  - Unit tests: 368 passed. The new test checks that the sample imports cleanly, grouping, `INT-` codes, category creation, attributes, re-upload skipping, row errors, and that a bad row writes nothing. Build compiled.
  - Chrome flow: a wide Add product with a ready barcode, then a 2×2 colour/size build with barcodes, then a sale price that shows on labels, stopped and re-added, then print 5 labels. Next the sample download, a bad file rejected, a good file imported, and Print 3 labels. Last, both deep links.
