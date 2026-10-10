/**
 * Master categories that group product categories for reporting.
 *
 * A product category belongs to exactly one master category via its
 * `category_group` column — the column keeps its old name so existing rows and
 * reports stay readable, but the values are the shop's own groups. This is a
 * coarse, owner-facing grouping so reports can be read at a glance without
 * listing every product category.
 *
 * Kept dependency-free so it is safe to import from both client components and
 * server code.
 */

export const MASTER_CATEGORIES = [
  { id: 'accessories', label: 'Accessories' },
  { id: 'cosmetics', label: 'Cosmetics' },
  { id: 'other', label: 'Other' },
];

export const DEFAULT_MASTER_CATEGORY = 'accessories';

const LABEL_BY_ID = new Map(MASTER_CATEGORIES.map((g) => [g.id, g.label]));

/** Stored value -> canonical id. */
const ALIASES = {
  accessory: 'accessories',
  accessories: 'accessories',
  cosmetic: 'cosmetics',
  cosmetics: 'cosmetics',
  makeup: 'cosmetics',
  beauty: 'cosmetics',
  other: 'other',
  misc: 'other',
  miscellaneous: 'other',
};

/** Coerce any stored value to a known group id, falling back to the default. */
export function normalizeMasterCategory(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return DEFAULT_MASTER_CATEGORY;
  if (v === 'uncategorised' || v === 'uncategorized') return 'uncategorised';
  const id = ALIASES[v] || v;
  return LABEL_BY_ID.has(id) ? id : DEFAULT_MASTER_CATEGORY;
}

/** Human label for a group id. `uncategorised` is handled for report rows. */
export function masterCategoryLabel(id) {
  if (id === 'uncategorised' || id === 'uncategorized') return 'Uncategorised';
  return LABEL_BY_ID.get(normalizeMasterCategory(id)) || 'Accessories';
}

/** SQL expression that yields a canonical group id for a product_categories alias. */
export function masterCategorySql(mcAlias = 'mc') {
  const g = `LOWER(TRIM(COALESCE(${mcAlias}.category_group, '${DEFAULT_MASTER_CATEGORY}')))`;
  return `CASE
    WHEN ${mcAlias}.id IS NULL THEN 'uncategorised'
    WHEN ${g} IN ('cosmetics', 'cosmetic', 'makeup', 'beauty') THEN 'cosmetics'
    WHEN ${g} IN ('accessories', 'accessory') THEN 'accessories'
    ELSE 'other'
  END`;
}
