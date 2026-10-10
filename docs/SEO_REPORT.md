# 99 Shop by Shahana: SEO implementation report

Date: 2026-09-29. Verified against a production build (`next build`, Turbopack)
served locally on SQLite demo data. Numbers below are local measurements, not
Google data. No ranking is promised; see `docs/SEO_OWNER_GUIDE.md` for the owner
checklist and query watchlist.

Status key: PASS (was already right, verified) · FIXED (changed and verified) ·
PARTIAL · BLOCKED · NOT APPLICABLE.

## 1. Baseline SEO Audit
The live site is the Next.js storefront, not the old hash-routed `index (4).html`.
It already had real routes: `/`, `/shop/<category>`, `/about`. Before this work:
- `robots.txt` allowed only `/store` and pointed to `/store/sitemap.xml`, which lists
  cart-shop products only when that shop is switched on. The main site was in no sitemap.
- No canonical tags, no page-specific Open Graph, no structured data.
- Titles repeated the brand ("Hair Clips — 99 Shop by Shahana | 99 Shop by Shahana").
- Product cards linked straight to WhatsApp; there were no product pages.
- One combined "About & Contact" page; no `/contact`.
- 404 page offered only "Go to login".
- `metadataBase` fell back to the placeholder `https://pos.example.com`; the root
  share image pointed at a null logo.
- Fonts loaded through a CSS `@import` (render-blocking chain); the three kitty PNGs weighed 395 KB.
- `/store` was indexable with the leftover title "Shop · Aadhar".
- Staff pages relied on robots.txt only; any `/api/` block would also have hidden
  product photos served from `/api/media/`.
- Phone gutters were missing on product grids (`.shop-section` padding shorthand).

## 2. Critical Problems Found
1. No sitemap for the real site. FIXED
2. No canonicals, and a placeholder domain as the fallback origin. FIXED (falls back to the request host)
3. No indexable product pages. FIXED
4. Unknown product/category URLs answered 200 (a root `loading.js` streamed before the 404). FIXED: real 404
5. Duplicate/conflicting `/store` catalogue. FIXED: noindex
6. Canonical host unknown. BLOCKED until `NEXT_PUBLIC_SITE_URL` is set

## 3. Brand SEO: FIXED
"99 Shop by Shahana" is the site name, the home title and H1 area, the OnlineStore
entity name, the footer and the share card. `alternateName` carries "99 Shop" and
"99shop"; Instagram/TikTok `@99shop_surkhet` are in `sameAs` and visible on every page.
"99 Shop Surkhet" is covered by titles such as "Hair Clips in Surkhet | 99 Shop".

## 4. Keyword / Search Intent Map: FIXED
One landing page per intent (full table in the owner guide):
brand and kawaii/cute-accessories intent → `/`; hair/claw clips → `/shop/hair-clips`;
cherry charms/keychains → `/shop/cherry`; keychains, charms, bag charms →
`/shop/charms-keychains`; product names → `/products/<slug>`; ordering/delivery →
`/contact`; story → `/about`. No keyword pages or hidden text.

## 5. URL Architecture: FIXED
| Before | After |
|---|---|
| `/` | `/` (unchanged) |
| `/shop/<category>` | unchanged (kept: already real, crawlable and linked) |
| product card → `wa.me` link | `/products/<slug>` (new) + separate WhatsApp button |
| `/about` (About & Contact) | `/about` + new `/contact` |
| `/store/*` | kept for the cart shop, `noindex, follow` |
Product slugs are stored once and survive renames. Hidden products keep their URL
with "not available right now", noindex and no Product markup.

## 6. Homepage SEO: FIXED
- Title: `99 Shop by Shahana | Kawaii Accessories in Surkhet` (50 chars, editable)
- Description (152 chars, editable): "Handpicked kawaii accessories from 99 Shop by Shahana in Surkhet: cute claw clips, cherry charms, keychains and new drops every week. Order on WhatsApp."
- H1 kept: "Cute. Cozy. Kawaii-fied." (space fixed); the existing intro names the shop, Surkhet, claw clips, charms and keychains.
- Added a link from "How to order" to `/contact`; product cards now link to product pages.

## 7. Category SEO: FIXED
Pattern `<Category> in Surkhet | 99 Shop`. Intro = the owner's category description
(new field in Catalog → Categories), otherwise one plain sentence. Meta description
adds "From 99 Shop by Shahana in Surkhet, order easily on WhatsApp." when the owner
copy is short. Breadcrumb (visible + BreadcrumbList), ItemList, H1 = category,
product names as H2, first two photos load eagerly. Categories come from the live
catalogue; none were invented, so the brief's "Clips & Claws" maps to the shop's own "Hair Clips".

## 8. Product SEO: FIXED
`/products/<slug>`: photo (alt "<name> from 99 Shop by Shahana"), name, category
link, real price or "Message for price", description, WhatsApp order button with
the product name pre-filled, delivery note, related products, breadcrumb.
Title `<Name> | 99 Shop Surkhet` unless the owner set an SEO title in Merchandising.
Product + Offer (NPR) only when a real price is shown; never ratings or reviews.

## 9. Local SEO: FIXED
Surkhet appears in titles, descriptions, the footer address, `/contact`, the delivery
note and `areaServed`, in natural sentences. No street address, hours or map were
invented; each has an optional owner field and appears only when filled.

## 10. Google Business Profile: BLOCKED
Eligibility depends on facts the site does not have (a visitable shop or a real
service area). Recommendation and rules are in the owner guide. The Maps-link field
feeds `/contact` and `sameAs` once a profile exists.

## 11. Structured Data: FIXED
OnlineStore (becomes Store when a street address is entered) + WebSite with shared
`@id`s on every page; BreadcrumbList on inner pages; ItemList on categories;
Product/Offer on priced products. Verified: valid JSON on every page, unit tests
for no-fake-price, no-invented-address and no-ratings. Not yet run through
Google's Rich Results Test (needs the public URL).

## 12. Metadata: FIXED
Unique title, description, self-canonical, Open Graph and Twitter card on `/`,
every category, product, `/about`, `/contact` (checked on 7 URLs; no duplicates).
Staff pages (`/admin`, `/cashier`, `/login`) carry `noindex, nofollow`.

## 13. Image SEO: PARTIAL
- Kitty hero images are now WebP: 395 KB → 89 KB. The PNGs are kept for old CMS values.
- Every `<img>` has alt text (0 missing on the audited pages), width and height, and lazy loading below the fold.
- Images are listed in the sitemap.
- Owner-uploaded product photos are served as uploaded. No automatic WebP conversion yet.

## 14. Internal Linking: FIXED
Header adds Contact; footer lists categories, About and Contact; home → categories,
products, contact; category → products; product → category, related products,
contact; About → every category; Contact → WhatsApp and the shop; 404 → home,
categories, contact, WhatsApp.

## 15. Sitemap / Robots: FIXED
`/sitemap.xml`: home, categories, available products (with images and real
`lastmod`), About, Contact. No hash, query, staff or cart URLs.
`/robots.txt`: allows `/` and `/api/media/`; blocks `/api/`, `/admin`, `/cashier`,
`/login`, `/store/cart|account|orders`; lists the sitemap. Both return 200.

## 16. Search Console: PARTIAL
Ready: verification-code field (Admin → Website → Search & sharing) and sitemap.
The owner still has to verify, submit and request indexing. No page is claimed as indexed.

## 17. Performance: PARTIAL
Local production build, phone viewport, 1.6 Mbps + 150 ms latency, 4× CPU slowdown:
| Page | LCP | CLS |
|---|---|---|
| `/` | 2.2 s (was 3.7 s) | 0 |
| `/shop/hair-clips` | 1.4 s (was 3.5 s) | 0 |
| `/products/…` | 1.2 s | 0 |
| `/contact` | 1.0 s | 0.028 |
The gains come from preloading the hero image, eager first-row photos, WebP kitties and parallel font loading.
PageSpeed/Lighthouse on the live domain has not been run.

## 18. Mobile SEO: PARTIAL
Checked at 390 px and 1440 px: no horizontal scroll and readable text. Fixed the
missing side gutters on product grids and the product page. 320/360/414/430 px not
screenshotted individually.

## 19. Accessibility: PARTIAL
One H1 per page; landmarks and labelled navs; breadcrumbs marked `aria-current`;
icon-only social links named "99 Shop by Shahana on Instagram/TikTok"; menu button
announces open/close; footer headings are real headings; links in text are
underlined. No full automated WCAG (axe) run.

## 20. Social / Entity Consistency: FIXED
Instagram `@99shop_surkhet`, TikTok `@99shop_surkhet`, WhatsApp +977 976-7896814
come from one settings source and appear identically in the header, footer,
`/contact`, structured data and the share card (`/og`, 1200×630, live categories).
Facebook is added only when a URL is entered.

## 21. Files Changed
New: `lib/seo.js`, `app/sitemap.js`, `app/og/route.jsx`, `app/(store)/products/[slug]/page.jsx`,
`app/(store)/contact/page.jsx`, `components/storefront/json-ld.jsx`,
`components/storefront/store-analytics.jsx`, `app/login/layout.jsx`,
`app/admin/loading.js`, `app/cashier/loading.js`, `app/store/loading.js`,
`public/storefront/kitty-{hero,bow,tulips}.webp`, `tests/unit/seo.test.js`,
`docs/SEO_OWNER_GUIDE.md`, `docs/SEO_REPORT.md`.
Changed: `app/(store)/layout.jsx`, `app/(store)/page.jsx`, `app/(store)/about/page.jsx`,
`app/(store)/shop/[slug]/page.jsx`, `app/(store)/storefront.css`, `app/robots.js`,
`app/not-found.js`, `app/layout.js`, `app/admin/layout.jsx`, `app/cashier/layout.jsx`,
`app/store/layout.jsx`, `components/storefront/product-card.jsx`,
`components/storefront/site-header.jsx`, `components/storefront/kitty-hero.jsx`,
`lib/storefront.js`, `lib/site-content.js`, `middleware.js`,
`components/commerce/catalog-setup.jsx`, `app/api/admin/commerce/catalog-setup/route.js`.
Removed: `app/loading.js` (moved to the three staff/cart areas).

## 22. Redirects Created
- `/Shop/…`, `/Products/…` (any capitals) → lower-case, 301. Verified.
- `www` ↔ bare domain and `http` → `https` onto `NEXT_PUBLIC_SITE_URL`, 301, production
  only. Not testable until the domain is known; only hosts that are variants of the
  canonical one are touched, so the hosting proxy cannot loop.
- Old `#/…` fragments never reach the server; they land on `/`. No redirect needed.

## 23. Build Results
- `next build` (Turbopack, `NEXT_DIST_DIR=.next-verify`): passed, 296 pages.
- `npm run build` (webpack): passed once at 8 GB heap earlier in the session;
  a later run hit "JavaScript heap out of memory" at 8 GB on this machine while a dev
  server was also running. See risks.
- `npm run test:unit`: 380/380 passed. ESLint on changed files: 0 errors.
- HTTP checks: all public pages 200; unknown page, category and product 404;
  `/robots.txt` 200 text; `/sitemap.xml` 200 XML; `/og` 200 PNG.

## 24. Remaining Risks
- The webpack production build is close to the memory limit. Build on a machine with
  headroom, or with `NODE_OPTIONS=--max-old-space-size=8192` and nothing else running.
- Canonicals use the request host until `NEXT_PUBLIC_SITE_URL` is set to the real domain.
- Product slugs were written into the local database the first time products were listed.
- Changing a slug by hand in Merchandising breaks the old URL; there is no slug-history redirect table.
- Local test data contains placeholder products ("Clips", "Test Retail Serum", "Hair Serum
  Wax" with description "ddfgdrfvc"). They are live-looking pages; hide or fix them before launch.
- Rich Results Test, PageSpeed on the live domain and full accessibility audit not run.

## 25. Owner Actions Required
1. Set `NEXT_PUBLIC_SITE_URL` to the real HTTPS domain, rebuild, deploy.
2. Verify the site in Google Search Console and submit `/sitemap.xml`.
3. Decide Google Business Profile eligibility; if eligible, create it with the exact
   name and paste its Maps link into Admin → Website.
4. Fill optional facts only if true: street address, hours, Facebook.
5. Write a one–two sentence description for each category; add real photos to every product.
6. Remove or hide test products.
7. Add the website link to Instagram and TikTok bios.
8. Review Search Console queries monthly against the watchlist in the owner guide.
