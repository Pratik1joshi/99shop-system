# Canonical merchandising and pricing policy

The monetary integrity gate passed before this phase; see `PHASE_20B_MONETARY_CLOSURE.md`. Phase 2A does not change inventory valuation, historical sale amounts, returns accounting or payment controls.

## Price resolution

`resolveRetailPrices` is the server authority. A quote aggregates quantities for each SKU across split lines. An active, explicitly assigned wholesale customer group selects the SKU wholesale price when its minimum quantity is met; otherwise the retail base price applies.

Eligible price-list rules must match the channel and assigned customer group. Start is inclusive; end is exclusive. The highest-priority rule wins. Ties resolve by customer-group specificity, channel specificity, SKU over product, highest eligible quantity tier, then newest list ID and rule ID. Exactly one rule applies; percentage rules adjust the selected retail/wholesale base, not another list's result. Currency is the existing NPR business currency.

Authorized per-line price overrides replace the resolved unit price before the canonical promotion engine evaluates the transaction. Promotions then apply, followed by authorized manual line/header discounts and loyalty redemption. Quote and checkout share their resolved price snapshot internally; checkout re-evaluates current server configuration. Frontends do not reproduce these rules. Price explanations are persisted on sale lines. A return uses original posted sale economics, irrespective of later list/group/base-price changes.

Margin policy checks final pre-tax merchandise revenue after all discounts against canonical carrying-value-derived cost. Modes are off, warning, or require the existing price-override permission. No numeric costs or margins are returned to unauthorized cashiers. Unknown cost does not fabricate a margin. Policy edits require price-override permission and retain audit evidence.

## Catalog identity and bulk writes

Canonical products remain `menu_items`, SKUs remain `menu_item_variants`, and existing generic attribute/barcode tables remain in use. A matrix is a preview until selected combinations are confirmed. SKU formatting is optional: prefix/sequence or prefix/attribute short codes. Merchants can edit generated codes before saving. `INT-` barcodes explicitly identify internal CODE128 labels and make no GS1 claim.

Catalog imports accept UTF-8 CSV, including quoted commas and multiline values. XLSX is not enabled because the repository has no workbook parser dependency. Imports target an explicitly selected canonical product, map columns, validate, preview, and apply atomically. Stable SKU IDs or existing SKU codes match updates. A preview records its actor and catalog fingerprint; stale previews must be rebuilt. Reapplying a completed job returns the original IDs. Catalog import never imports quantities or posts inventory movements.

Transaction-linked SKU codes, attributes and tracking policies cannot silently change. The legacy full-product edit now preserves matched SKU IDs and archives omitted variants instead of deleting/recreating them. Barcode mutations across canonical and legacy product APIs use a shared transaction lock over the existing barcode namespace; duplicate checks include alternate barcodes.

Bulk price, list, group, assignment, policy and merchandising actions retain actor, reason and before/after evidence. Purchase-cost metadata is permission-gated and does not overwrite inventory carrying value. Supplier identifiers remain separate from canonical SKUs. Purchase history is factual posted-GRN history; cost variance compares the same supplier, SKU, purchase unit and conversion factor.

## Publication and labels

Online fields are optional for in-store products. Migration defaults online publication off and preserves existing financial records. Images accept uploaded `/uploads/` paths or HTTPS URLs; image URLs are not fetched by merchandising services. Public-safe catalog DTOs and checkout remain Phase 2B work.

Labels use bounded SKU selection, server-resolved current prices, MRP, SKU, variant and optional business identity. Templates use browser printing; no hardware-printer integration is claimed. A batch is capped at 200 SKUs and 1,000 labels.

## Scope boundaries

No multi-branch, multi-currency, inferred customer segmentation, external payment provider, marketplace integration or independent commerce economics is introduced. CSV imports currently operate within one selected product; they do not create category/product masters from spelling-based spreadsheet matches.
