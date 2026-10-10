# 99 Shop by Shahana: search setup and owner checklist

This is the working guide for keeping the public site findable. It lists what the
code already does, what only the owner can do, and which searches to watch.
Rankings cannot be guaranteed; the goal is to give Google clear, honest signals.

## Settings the owner fills in (Admin → Website)

Everything unknown is a blank field, never a guess. Blank means "not shown".

| Field | Where | Effect |
|---|---|---|
| Home page title / description on Google | Search & sharing | The home result snippet |
| Google Search Console code | Search & sharing | Adds the verification meta tag |
| Google Analytics ID (`G-…`) | Search & sharing | Loads GA4 and counts WhatsApp, Instagram and TikTok clicks |
| Street address | Contact & ordering | Only if customers can visit. Switches structured data from an online shop to a store |
| Opening hours | Contact & ordering | Shown on /contact only when filled |
| Google Maps link | Contact & ordering | "Open in Google Maps" on /contact, and listed as a profile link |
| Facebook page URL | Contact & ordering | Listed as a profile link when filled |
| Delivery & pickup | Contact & ordering | Text on /contact and every product page |
| Category picture and description | Catalog → Categories & brands | Category card image, the page intro and its Google description |
| Web address, SEO title, SEO description | Products → Merchandising | Per-product address and snippet |

The production domain is set by the host, not in the admin: set
`NEXT_PUBLIC_SITE_URL=https://your-domain` **before** `npm run build`. With it
set, `www`/non-`www` and `http` requests are sent to that one address with a 301.

## Public URLs

| Page | Address |
|---|---|
| Home | `/` |
| Category | `/shop/<category>` e.g. `/shop/hair-clips`, `/shop/charms-keychains`, `/shop/cherry` |
| Product | `/products/<product>` e.g. `/products/sky-gingham-cloud-claw-clip` |
| About | `/about` |
| Contact & ordering | `/contact` |
| Sitemap / robots | `/sitemap.xml`, `/robots.txt` |
| Share image | `/og` |

A product's address is written once, the first time it appears on the site, and
does not change when the product is renamed, so shared links keep working. If
you change it by hand in Merchandising, the old address stops working.
A product switched off stays reachable for old links ("not available right now")
but is removed from the sitemap and marked noindex.

## Which page answers which search

| Search people type | Page that should answer |
|---|---|
| 99 Shop, 99 Shop Surkhet, 99shop Surkhet, 99 Shop by Shahana, @99shop_surkhet | `/` |
| kawaii shop / kawaii accessories / cute accessories Surkhet, cute gifts Surkhet | `/` |
| claw clips Surkhet, hair clips Surkhet, cute or kawaii hair clips, bow / cloud / gingham claw clips | `/shop/hair-clips` |
| cherry charm, cherry keychain, cherry bag charm | `/shop/cherry` |
| keychains Surkhet, cute keychains, charms Surkhet, bag charms | `/shop/charms-keychains` |
| a product's own name, e.g. Sky Gingham Cloud Claw Clip | `/products/<that product>` |
| how to order, delivery Surkhet, 99 Shop WhatsApp / phone | `/contact` |
| who is Shahana, when did 99 Shop start | `/about` |

One page per intent. Do not add pages for spelling variants or for each keyword.

## Owner actions, in order

1. Set `NEXT_PUBLIC_SITE_URL` to the real HTTPS domain and rebuild.
2. Google Search Console: add the domain property (DNS record, preferred) or a URL
   property (paste the meta code into Admin → Website → Search & sharing).
3. Submit `https://<domain>/sitemap.xml` in Search Console → Sitemaps.
4. URL Inspection → test `/`, each `/shop/…` page and `/contact`, then Request indexing.
5. Check Page indexing and Core Web Vitals after a week or two.
6. Google Business Profile: only if eligible. A shop customers visit, or a real
   delivery service area around Surkhet, can qualify. Do not list a home address
   publicly and do not invent a storefront. Name it exactly "99 Shop by Shahana".
   If you create one, paste its Maps link into the Contact settings.
7. Put the website link in the Instagram and TikTok bios, using the same name and logo.
8. Photos: upload your own product photos in Products; keep file names descriptive.
9. Reviews: only real ones. Ask every customer the same neutral way; never offer
   rewards for good reviews and never filter who is asked.
10. Local listings: a few real ones (Google Business Profile, Facebook page if you
    use it, genuine local directories or press). No bulk directory submissions.

## Search queries to watch (Search Console → Performance)

Record impressions, clicks and average position monthly. Improve the page that
should answer a query (see the table above); never add hidden text.

- Brand: 99 Shop · 99 Shop Surkhet · 99shop Surkhet · 99 Shop by Shahana · 99 Shop by Shahana Surkhet
- Kawaii: kawaii shop Surkhet · kawaii accessories Surkhet · cute accessories Surkhet
- Hair: hair clips Surkhet · claw clips Surkhet · cute claw clips Surkhet · kawaii hair clips Surkhet
- Keychains: keychains Surkhet · cute keychains Surkhet · kawaii keychains Surkhet
- Charms: charms Surkhet · bag charms Surkhet · cherry charms Surkhet · cherry keychain Surkhet

## Content ideas, only with real shop knowledge and photos

How to choose a claw clip · How to style bag charms · Gift ideas for your best friend ·
Caring for resin charms · This week's new drops. Quality over quantity.
