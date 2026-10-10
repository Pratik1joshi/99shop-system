/**
 * Sizes, colours and other options of a product, as typed in the product
 * editor, lined up with the versions (SKUs) the product already has.
 */
export const splitValues = (text) => [...new Set(text.split(',').map((v) => v.trim()).filter(Boolean))];
/** Every combination of the typed values: Colour Pink, Black × Size M, L = 4 versions. */
export function combinations(axes) {
  const filled = axes.map((a) => ({ name: a.name.trim() || 'Option', values: splitValues(a.values) })).filter((a) => a.values.length);
  if (!filled.length) return [];
  return filled.reduce((rows, axis) => rows.flatMap((row) => axis.values.map((value) => ({ ...row, [axis.name]: value }))), [{}]);
}

export const isStandard = (v) => !v.variant_name || v.variant_name === 'Standard';
export const hasOptions = (v) => Object.keys(v.attributes || {}).length > 0;
export const optionKey = (attrs) => Object.entries(attrs || {}).map(([k, v]) => `${k.toLowerCase()}=${String(v).toLowerCase()}`).sort().join('|');
export const optionName = (attrs) => Object.values(attrs).join(' / ');

/** The types and values a product already uses, in the order they first appear. */
export function axesFrom(variants) {
  const axes = new Map();
  for (const v of variants) for (const [name, value] of Object.entries(v.attributes || {})) {
    if (!axes.has(name)) axes.set(name, []);
    if (!axes.get(name).includes(value)) axes.get(name).push(value);
  }
  return [...axes].map(([name, values]) => ({ name, values: values.join(', ') }));
}

/**
 * Lines the typed types/values up with the versions the product has. A version
 * is kept when it matches a combination — a type it lacks or that was dropped
 * is ignored, so adding or removing a whole type keeps the versions. Unmatched
 * combinations are added; unmatched versions and the leftover “Standard” go.
 * Versions without any options other than Standard are left alone.
 */
export function planOptions(axes, variants) {
  const targets = combinations(axes);
  const keep = new Map();
  const used = new Set();
  const fits = (v, target) => hasOptions(v) && Object.entries(target).every(([name, value]) => {
    const own = Object.entries(v.attributes).find(([n]) => n.toLowerCase() === name.toLowerCase());
    return !own || String(own[1]).toLowerCase() === String(value).toLowerCase();
  });
  const assign = (match) => targets.forEach((target, ti) => {
    if (used.has(ti)) return;
    const index = variants.findIndex((v, vi) => !keep.has(vi) && match(v, target));
    if (index >= 0) { keep.set(index, target); used.add(ti); }
  });
  assign((v, target) => hasOptions(v) && optionKey(v.attributes) === optionKey(target));
  assign(fits);
  const remove = targets.length ? variants.map((_, i) => i).filter((i) => !keep.has(i) && (hasOptions(variants[i]) || isStandard(variants[i]))) : [];
  return { targets, keep, add: targets.filter((_, ti) => !used.has(ti)), remove,
    renamed: [...keep].filter(([i, target]) => optionKey(variants[i].attributes) !== optionKey(target)).length };
}
