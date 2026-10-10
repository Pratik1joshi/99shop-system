import { ensureSqliteTable } from './db/ensure-sqlite-table.js';
import { LOGO_IMAGE } from './storefront-links.js';

/**
 * Editable storefront copy.
 *
 * Every word the public site shows that is not a product lives here, as a flat
 * key/value table the owner edits at /admin/website. The defaults below are the
 * original page text, so an empty table renders exactly the site that shipped —
 * nothing has to be seeded before the storefront works.
 *
 * A blank value means "use the default" rather than "show nothing", so clearing
 * a field in the admin screen restores the shipped wording instead of leaving a
 * hole in the page.
 */

/** Field kinds the editor knows how to render. */
export const FIELD_TEXT = 'text';
export const FIELD_AREA = 'textarea';
export const FIELD_IMAGE = 'image';
// Uploaded files, shipped storefront assets or an https:// link — never markup.
const IMAGE_VALUE = /^(?:\/uploads\/menu\/|\/api\/media\/|\/storefront\/|https:\/\/)[^\s"'<>]+$/;

/**
 * The content model, grouped the way the editor lays it out.
 * `key` is what the database stores; `label` and `hint` are for the editor.
 */
export const CONTENT_GROUPS = [
  {
    id: 'shop',
    title: 'Shop identity',
    blurb: 'Used across the storefront, the page titles and the footer.',
    fields: [
      { key: 'shop.logo', label: 'Logo', type: FIELD_IMAGE, default: LOGO_IMAGE, hint: 'A square picture works best. Shown in the header, the home page and the About page.' },
      { key: 'shop.name', label: 'Shop name', type: FIELD_TEXT, default: '99 Shop by Shahana' },
      { key: 'shop.short_name', label: 'Short name', type: FIELD_TEXT, default: '99 Shop', hint: 'Shown in the header beside the logo.' },
      { key: 'shop.brand_sub', label: 'Header sub-line', type: FIELD_TEXT, default: 'BY SHAHANA · SURKHET' },
      { key: 'shop.tagline', label: 'Tagline', type: FIELD_TEXT, default: 'Kawaii accessories in Surkhet', hint: 'Appears in the browser tab and search results.' },
      { key: 'shop.intro', label: 'Home page introduction', type: FIELD_AREA, default: "99 Shop by Shahana brings soft claw clips, sparkly charms and keychains to Surkhet — handpicked, not mass-dumped. Tap, chat, and it's yours.", hint: 'Shown under the home page heading.' },
      { key: 'shop.city', label: 'City', type: FIELD_TEXT, default: 'Surkhet' },
      { key: 'shop.address', label: 'Full address', type: FIELD_TEXT, default: 'Surkhet, Nepal' },
    ],
  },
  {
    id: 'contact',
    title: 'Contact & ordering',
    blurb: 'Where the Order buttons send customers.',
    fields: [
      { key: 'contact.phone_display', label: 'Phone (as shown)', type: FIELD_TEXT, default: '+977 976-7896814' },
      { key: 'contact.whatsapp_number', label: 'WhatsApp number', type: FIELD_TEXT, default: '9779767896814', hint: 'Digits only, including the country code. This is what the Order buttons dial.' },
      { key: 'contact.instagram_url', label: 'Instagram URL', type: FIELD_TEXT, default: 'https://www.instagram.com/99shop_surkhet' },
      { key: 'contact.instagram_handle', label: 'Instagram handle', type: FIELD_TEXT, default: '@99shop_surkhet' },
      { key: 'contact.tiktok_url', label: 'TikTok URL', type: FIELD_TEXT, default: 'https://www.tiktok.com/@99shop_surkhet' },
      { key: 'contact.tiktok_handle', label: 'TikTok handle', type: FIELD_TEXT, default: '@99shop_surkhet' },
      { key: 'contact.order_message', label: 'Pre-filled WhatsApp message', type: FIELD_AREA, default: "Hi 99 Shop! I'd love to order something cute from your shop 🎀", hint: 'Sent when someone taps a general Order button. Product buttons add the product name.' },
      // Optional facts. Left blank they are simply not shown, so the site never guesses.
      { key: 'contact.street_address', label: 'Street address (optional)', type: FIELD_TEXT, default: '', hint: 'Only if customers can visit. Leave blank to show just the city.' },
      { key: 'contact.hours', label: 'Opening hours (optional)', type: FIELD_TEXT, default: '', hint: 'e.g. Sun–Fri, 10am–7pm. Leave blank if you have no fixed hours.' },
      { key: 'contact.maps_url', label: 'Google Maps link (optional)', type: FIELD_TEXT, default: '', hint: 'Your Google Business Profile or Maps link, if you have one.' },
      { key: 'contact.facebook_url', label: 'Facebook page URL (optional)', type: FIELD_TEXT, default: '' },
      { key: 'contact.delivery_note', label: 'Delivery & pickup', type: FIELD_AREA, default: 'Pay on delivery around Surkhet, or arrange a pickup with us. We confirm the details with you on WhatsApp before anything is sent.' },
    ],
  },
  {
    id: 'seo',
    title: 'Search & sharing',
    blurb: 'How the shop appears on Google and when a link is shared on WhatsApp or Instagram.',
    fields: [
      { key: 'seo.home_title', label: 'Home page title on Google', type: FIELD_TEXT, default: '99 Shop by Shahana | Kawaii Accessories in Surkhet', hint: 'Keep it under about 60 characters.' },
      { key: 'seo.home_description', label: 'Home page description on Google', type: FIELD_AREA, default: 'Handpicked kawaii accessories from 99 Shop by Shahana in Surkhet: cute claw clips, cherry charms, keychains and new drops every week. Order on WhatsApp.', hint: 'About 150 characters. Write it for people, not for search engines.' },
      { key: 'seo.google_verification', label: 'Google Search Console code (optional)', type: FIELD_TEXT, default: '', hint: 'Paste only the content="…" value from the HTML tag Search Console gives you.' },
      { key: 'seo.ga_id', label: 'Google Analytics ID (optional)', type: FIELD_TEXT, default: '', hint: 'Looks like G-XXXXXXXXXX. Leave blank for no analytics.' },
    ],
  },
  {
    id: 'home',
    title: 'Home page',
    blurb: 'The hero and the section headings above your products.',
    fields: [
      { key: 'home.eyebrow', label: 'Eyebrow tag', type: FIELD_TEXT, default: '🎀 New drops every week' },
      { key: 'home.headline', label: 'Headline', type: FIELD_TEXT, default: 'Cute. Cozy.' },
      { key: 'home.headline_accent', label: 'Headline second line', type: FIELD_TEXT, default: 'Kawaii-fied.', hint: 'Shown in pink italics under the headline.' },
      { key: 'home.hero_image', label: 'Hero kitty image', type: FIELD_IMAGE, default: '/storefront/kitty-hero.webp', hint: 'The main image in the home page hero.' },
      { key: 'home.float_image_left', label: 'Floating image, left', type: FIELD_IMAGE, default: '/storefront/kitty-tulips.webp', hint: 'The small image floating beside the hero.' },
      { key: 'home.float_image_right', label: 'Floating image, right', type: FIELD_IMAGE, default: '/storefront/kitty-bow.webp', hint: 'Also used as the decorative image on the About page.' },
      { key: 'home.cta_primary', label: 'Main button', type: FIELD_TEXT, default: 'Order on WhatsApp' },
      { key: 'home.cta_secondary', label: 'Second button', type: FIELD_TEXT, default: 'Explore Shop' },
      { key: 'home.categories_title', label: 'Categories heading', type: FIELD_TEXT, default: 'Categories' },
      { key: 'home.about_tile_label', label: 'About tile label', type: FIELD_TEXT, default: 'About us' },
      { key: 'home.featured_tag', label: 'Favorites eyebrow', type: FIELD_TEXT, default: '🎀 New & Loved' },
      { key: 'home.featured_title', label: 'Favorites heading', type: FIELD_TEXT, default: 'A few current favorites' },
    ],
  },
  {
    id: 'steps',
    title: 'How to order',
    blurb: 'The three steps at the bottom of the home page.',
    fields: [
      { key: 'steps.tag', label: 'Eyebrow', type: FIELD_TEXT, default: '🎀 How to Order' },
      { key: 'steps.title', label: 'Heading', type: FIELD_TEXT, default: "Three cute steps, that's it." },
      { key: 'steps.one_title', label: 'Step 1 title', type: FIELD_TEXT, default: 'Pick your favorites' },
      { key: 'steps.one_body', label: 'Step 1 text', type: FIELD_AREA, default: 'Tap “Order →” under any item you love, or browse the whole shop and message us your picks.' },
      { key: 'steps.two_title', label: 'Step 2 title', type: FIELD_TEXT, default: 'Chat & confirm' },
      { key: 'steps.two_body', label: 'Step 2 text', type: FIELD_AREA, default: "We'll reply with stock and photos, then confirm your order and delivery or pickup details." },
      { key: 'steps.three_title', label: 'Step 3 title', type: FIELD_TEXT, default: 'Receive it, cutely wrapped' },
      { key: 'steps.three_body', label: 'Step 3 text', type: FIELD_AREA, default: 'Pay on delivery around Surkhet, or arrange pickup. Every order is packed with care.' },
    ],
  },
  {
    id: 'category',
    title: 'Category pages',
    blurb: 'The banner note and the invitation under every category listing.',
    fields: [
      { key: 'category.empty_note', label: 'Empty category note', type: FIELD_AREA, default: "Nothing in this category right now — message us and we'll tell you what's in." },
      { key: 'category.cta_title', label: 'Invitation heading', type: FIELD_TEXT, default: "Didn't find your favorite?" },
      { key: 'category.cta_body', label: 'Invitation text', type: FIELD_AREA, default: "We restock every week — ask us what's fresh." },
      { key: 'category.cta_button', label: 'Invitation button', type: FIELD_TEXT, default: 'Ask on WhatsApp' },
    ],
  },
  {
    id: 'about',
    title: 'About page',
    blurb: 'Your story and the contact cards.',
    fields: [
      { key: 'about.banner_title', label: 'Banner heading', type: FIELD_TEXT, default: 'A little shop, started with a big soft spot for cute things.' },
      { key: 'about.banner_lede', label: 'Banner text', type: FIELD_AREA, default: 'Everything you need to know about us — and the fastest ways to reach us.' },
      { key: 'about.story_title', label: 'Story heading', type: FIELD_TEXT, default: 'Our story' },
      { key: 'about.story_body', label: 'Story', type: FIELD_AREA, default: "99 Shop by Shahana started in 2024 right here in Surkhet, with one simple idea: little accessories can make an ordinary day feel a bit softer and a lot cuter.\n\nEvery claw clip, charm and keychain is handpicked, not mass-dumped — we'd rather bring you fewer pieces we genuinely love than everything under the sun. New drops land often, so it's always worth a peek.", hint: 'Leave a blank line between paragraphs.' },
      { key: 'about.signature', label: 'Signature', type: FIELD_TEXT, default: '— Shahana, 99 Shop' },
      { key: 'about.contact_tag', label: 'Contact eyebrow', type: FIELD_TEXT, default: '🎀 Get in touch' },
      { key: 'about.contact_title', label: 'Contact heading', type: FIELD_TEXT, default: "However you like to chat, we're there." },
    ],
  },
  {
    id: 'footer',
    title: 'Footer',
    blurb: 'The bottom of every page.',
    fields: [
      { key: 'footer.shop_heading', label: 'Shop column heading', type: FIELD_TEXT, default: 'Shop' },
      { key: 'footer.description', label: 'Footer introduction', type: FIELD_AREA, default: 'Kawaii hair clips, charms and keychains — handpicked in Surkhet, Nepal. Order in one tap on WhatsApp.' },
      { key: 'footer.reach_heading', label: 'Contact column heading', type: FIELD_TEXT, default: 'Reach us' },
      { key: 'footer.note', label: 'Closing note', type: FIELD_TEXT, default: 'Made with 🎀 in Surkhet' },
    ],
  },
];

/** Flat map of key -> field definition. */
export const CONTENT_FIELDS = new Map(
  CONTENT_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field]))
);

/** Every key the editor is allowed to write. */
export const CONTENT_KEYS = [...CONTENT_FIELDS.keys()];

/** The shipped copy, used whenever a row is missing or blank. */
export const CONTENT_DEFAULTS = Object.freeze(
  Object.fromEntries(CONTENT_KEYS.map((key) => [key, CONTENT_FIELDS.get(key).default]))
);

export async function ensureSiteContentTable(db) {
  await ensureSqliteTable(
    db,
    `CREATE TABLE IF NOT EXISTS site_content (
      content_key TEXT PRIMARY KEY,
      content_value TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
}

/**
 * Current copy, with every key present.
 *
 * Unknown rows left over from an older model are ignored rather than returned,
 * so a renamed key can never leak a stale value into the page.
 */
export async function getSiteContent(db) {
  await ensureSiteContentTable(db);
  let rows = [];
  try {
    rows = await db.all('SELECT content_key, content_value FROM site_content');
  } catch {
    // A fresh Postgres database has not run the migration yet; defaults still
    // render the site correctly, so this must not take the storefront down.
    rows = [];
  }
  const stored = new Map((rows || []).map((row) => [row.content_key, row.content_value]));
  const content = {};
  for (const key of CONTENT_KEYS) {
    const value = stored.get(key);
    content[key] = value == null || String(value).trim() === '' ? CONTENT_DEFAULTS[key] : value;
  }
  return content;
}

/** Raw stored values, so the editor can show which fields are customised. */
export async function getStoredSiteContent(db) {
  await ensureSiteContentTable(db);
  const rows = await db.all('SELECT content_key, content_value FROM site_content');
  const stored = {};
  for (const row of rows || []) {
    if (CONTENT_FIELDS.has(row.content_key)) stored[row.content_key] = row.content_value;
  }
  return stored;
}

/**
 * Write the supplied keys. A blank value deletes the row so the field falls
 * back to its default rather than rendering as empty.
 */
export async function saveSiteContent(db, patch = {}) {
  await ensureSiteContentTable(db);
  // Check every image first so a bad value cannot leave a half-saved update.
  for (const [key, raw] of Object.entries(patch)) {
    const value = String(raw ?? '').trim();
    if (CONTENT_FIELDS.get(key)?.type === FIELD_IMAGE && value && !IMAGE_VALUE.test(value)) {
      throw Object.assign(new Error('Upload the image, or use an https:// link.'), { status: 400 });
    }
  }
  const written = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!CONTENT_FIELDS.has(key)) continue;
    const value = raw == null ? '' : String(raw).slice(0, 4000);
    if (value.trim() === '') {
      await db.run('DELETE FROM site_content WHERE content_key = ?', [key]);
    } else {
      await db.run(
        `INSERT INTO site_content (content_key, content_value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (content_key) DO UPDATE SET
           content_value = EXCLUDED.content_value,
           updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    }
    written.push(key);
  }
  return written;
}

/** WhatsApp deep link for a given message. */
export function whatsappLink(content, message) {
  const number = String(content['contact.whatsapp_number'] || '').replace(/\D/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Pre-filled WhatsApp text for one product. */
export function orderMessageFor(content, productName) {
  return `Hi ${content['shop.short_name']}! I'd love to order the ${productName} 🎀`;
}

/** Split a textarea value into paragraphs on blank lines. */
export function paragraphs(value) {
  return String(value || '')
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}
