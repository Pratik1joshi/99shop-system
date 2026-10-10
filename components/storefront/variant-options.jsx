'use client';

import { useState } from 'react';

/**
 * One row per option type (Size: S M L, Colour: Red Black Pink). The shopper
 * picks a value in each row; once every row has a pick, the matching version
 * is selected (onSelect(id)) so its price and stock show. Until then
 * onSelect(null). Values that do not exist with the current picks, or are
 * sold out, are marked; choosing one anyway starts the other rows over.
 */
export default function VariantOptions({ variants, selectedId, onSelect, className = '' }) {
  const [picked, setPicked] = useState(() => Object.fromEntries((variants.find((v) => v.id === selectedId)?.attributes || []).map((a) => [a.name, a.value])));
  if (variants.length < 2) return null;

  const groups = new Map();
  for (const variant of variants) {
    for (const attribute of variant.attributes || []) {
      if (!groups.has(attribute.name)) groups.set(attribute.name, new Map());
      groups.get(attribute.name).set(attribute.value, attribute);
    }
  }
  const plain = variants.filter((variant) => !variant.attributes?.length);
  const has = (variant, name, value) => (variant.attributes || []).some((a) => a.name === name && a.value === value);
  // A version fits the picks when it agrees with every pick it has an option for.
  const fits = (variant, picks) => variant.attributes?.length > 0 && variant.attributes.every((a) => !(a.name in picks) || picks[a.name] === a.value);
  const exact = (picks) => variants.find((v) => v.attributes?.length && v.attributes.every((a) => picks[a.name] === a.value) && Object.keys(picks).every((n) => v.attributes.some((a) => a.name === n)));

  function pick(name, value) {
    let next = { ...picked, [name]: value };
    if (!variants.some((v) => fits(v, next) && has(v, name, value))) next = { [name]: value };
    setPicked(next);
    onSelect(exact(next)?.id ?? null);
  }
  function pickPlain(id) { setPicked({}); onSelect(id); }

  const missing = [...groups.keys()].filter((name) => !(name in picked));
  return <div className={`variant-groups ${className}`}>
    {[...groups].map(([name, values]) => {
      const others = Object.fromEntries(Object.entries(picked).filter(([n]) => n !== name));
      return <fieldset className="variant-group" key={name}>
        <legend>{name}{name in picked && <span> · {picked[name]}</span>}</legend>
        <div className="variant-values">{[...values].map(([value, attribute]) => {
          const options = variants.filter((v) => has(v, name, value) && fits(v, others));
          const state = !options.length ? 'unavailable' : options.every((v) => Number(v.available) <= 0) ? 'soldout' : undefined;
          return <button key={value} type="button" data-state={state} aria-pressed={picked[name] === value} aria-label={state ? `${value} (${state === 'soldout' ? 'sold out' : 'not available with your other choices'})` : undefined} onClick={() => pick(name, value)}>
            {attribute.swatch && /^#[0-9a-f]{6}$/i.test(attribute.swatch) && <i style={{ backgroundColor: attribute.swatch }} aria-hidden="true" />}{value}
          </button>;
        })}</div>
      </fieldset>;
    })}
    {plain.length > 0 && <fieldset className="variant-group"><legend>{groups.size ? 'Other options' : 'Option'}</legend><div className="variant-values">{plain.map((variant) => <button key={variant.id} type="button" data-state={Number(variant.available) <= 0 ? 'soldout' : undefined} aria-pressed={variant.id === selectedId} onClick={() => pickPlain(variant.id)}>{variant.variant_name || 'Standard'}</button>)}</div></fieldset>}
    {selectedId == null && <p className="variant-hint">{missing.length && Object.keys(picked).length ? `Now choose ${missing.join(' and ').toLowerCase()}.` : `Choose ${groups.size ? [...groups.keys()].join(' and ').toLowerCase() : 'an option'} to see the price and stock.`}</p>}
  </div>;
}

/** The version to start on: the only one, or none so the shopper chooses. */
export const firstVariantId = (variants) => (variants.length === 1 ? variants[0].id : null);

/** "Rs 100" or "Rs 100 – Rs 150" across the versions still to choose from. */
export function priceRange(variants, format) {
  const prices = variants.map((v) => v.price?.unit_price).filter((n) => n != null).map(Number);
  if (!prices.length) return null;
  const low = Math.min(...prices), high = Math.max(...prices);
  return low === high ? format(low) : `${format(low)} – ${format(high)}`;
}
