# Storefront catalog images

The initial production seed uses these paths:

| Folder | Contents |
| --- | --- |
| `categories/` | Category cover photos |
| `products/hair-clips/` | Hair clip product photos |
| `products/cherry/` | Cherry product photos |

The files here are copies of the shop's existing storefront photos. The original
paths remain in place for older links. Upload new product photos into the
matching product folder, then add their public `/storefront/catalog/...` paths
to `retail_product_media` and `menu_items.image_url` in the production SQL.

The seed file is `deploy/manual-sql/shop99-storefront-catalog-2026-10-01.sql`.
Deploy this folder together with the application before applying that SQL.
