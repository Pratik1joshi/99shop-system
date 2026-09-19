-- Editable storefront copy.
--
-- Every word the public site shows that is not a product. Rows are optional:
-- `lib/site-content.js` carries the shipped wording as defaults, so an empty
-- table renders the site exactly as it ships and a deleted row restores the
-- default rather than blanking the page.
CREATE TABLE IF NOT EXISTS site_content (
  content_key TEXT PRIMARY KEY,
  content_value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
