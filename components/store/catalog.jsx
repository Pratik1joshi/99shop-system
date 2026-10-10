'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SHOP } from '@/lib/shop-info.js';
import { storeFetch } from './store-api.js';

const FILTER_LIMIT = 8;
const cash = (value) => `Rs ${Number(value || 0).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Catalog({ initialCategory = '' }) {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(initialCategory);
  const [brand, setBrand] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [availability, setAvailability] = useState('');
  const [attributes, setAttributes] = useState({});
  const [sort, setSort] = useState('featured');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState({});
  const resultsRef = useRef(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ query, category, brand, sort, min_price: minPrice, max_price: maxPrice, availability, attributes: Object.values(attributes).filter(Boolean).join(','), page: String(page) });
      setLoading(true);
      storeFetch(`catalog?${params}`).then((result) => {
        if (active) { setData(result); setError(''); }
      }).catch((cause) => { if (active) setError(cause.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [query, category, brand, sort, minPrice, maxPrice, availability, attributes, page]);

  const change = (setter) => (value) => { setter(value); setPage(1); };
  const clear = () => { setQuery(''); setCategory(''); setBrand(''); setMinPrice(''); setMaxPrice(''); setAvailability(''); setAttributes({}); setSort('featured'); setPage(1); };
  const facets = [...new Map((data?.facets || []).map((facet) => [facet.id, facet.name]))];
  const activeCount = [query, category, brand, minPrice, maxPrice, availability, ...Object.values(attributes)].filter(Boolean).length;
  const chosenCategory = data?.categories.find((item) => String(item.id) === String(category));
  // Long filter lists show the first few (plus the chosen one) until expanded.
  const limited = (key, list, isChosen) => (expanded[key] ? list : list.filter((item, index) => index < FILTER_LIMIT || isChosen(item)));
  const moreButton = (key, list) => list.length > FILTER_LIMIT && <button type="button" className="store-filter-more" aria-expanded={Boolean(expanded[key])} onClick={() => setExpanded((old) => ({ ...old, [key]: !old[key] }))}>{expanded[key] ? 'Show fewer' : `Show all ${list.length}`}</button>;
  const goTo = (next) => { setPage(next); resultsRef.current?.scrollIntoView({ block: 'start' }); };

  return <>
    <section className="store-intro">
      <p className="store-eyebrow">DISCOVER YOUR NEXT FAVOURITE</p>
      <h1>{chosenCategory?.name || 'All products'}</h1>
      <p>Browse the collection, choose the exact variant, and order for collection or delivery.</p>
    </section>
    <section className="store-catalog" aria-label="Product catalog">
      <div className="store-catalog-toolbar">
        <div><strong>{chosenCategory?.name || 'The complete collection'}</strong><span>{loading ? 'Updating products…' : `${data?.products.length ?? 0} product${data?.products.length === 1 ? '' : 's'} on this page`}</span></div>
        <button className="store-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="store-filter-panel" onClick={() => setFiltersOpen((open) => !open)}>Filters{activeCount ? ` (${activeCount})` : ''}<span aria-hidden="true">☷</span></button>
        <label className="store-sort">Sort by<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="name">Name</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label>
      </div>
      <div className="store-catalog-layout">
        <aside className={`store-filter-panel${filtersOpen ? ' open' : ''}`} id="store-filter-panel" aria-label="Product filters">
          <div className="store-filter-heading"><h2>Filter products</h2>{activeCount > 0 && <button type="button" onClick={clear}>Clear all</button>}</div>
          <label className="store-filter-search">Search products<input type="search" placeholder="Name, brand, shade…" value={query} onChange={(event) => change(setQuery)(event.target.value)} /></label>
          <fieldset className="store-filter-group"><legend>Categories</legend><div className="store-filter-choices"><button type="button" aria-pressed={!category} onClick={() => change(setCategory)('')}>All products</button>{data && limited('categories', data.categories, (item) => String(item.id) === String(category)).map((item) => <button type="button" key={item.id} aria-pressed={String(category) === String(item.id)} onClick={() => change(setCategory)(String(item.id))}>{item.name}</button>)}</div>{data && moreButton('categories', data.categories)}</fieldset>
          {data?.brands.length > 0 && <fieldset className="store-filter-group"><legend>Brand</legend><div className="store-filter-choices"><button type="button" aria-pressed={!brand} onClick={() => change(setBrand)('')}>All brands</button>{limited('brands', data.brands, (item) => item === brand).map((item) => <button type="button" key={item} aria-pressed={brand === item} onClick={() => change(setBrand)(item)}>{item}</button>)}</div>{moreButton('brands', data.brands)}</fieldset>}
          {facets.map(([id, name]) => <label key={id} className="store-filter-field">{name}<select value={attributes[id] || ''} onChange={(event) => { setAttributes((old) => ({ ...old, [id]: event.target.value })); setPage(1); }}><option value="">All {name.toLowerCase()}</option>{data.facets.filter((facet) => facet.id === id).map((facet) => <option key={facet.value_id} value={facet.value_id}>{facet.value}</option>)}</select></label>)}
          <fieldset className="store-filter-group"><legend>Price (Rs)</legend><div className="store-price-range"><label>From<input type="number" min="0" inputMode="numeric" value={minPrice} onChange={(event) => change(setMinPrice)(event.target.value)} /></label><label>To<input type="number" min="0" inputMode="numeric" value={maxPrice} onChange={(event) => change(setMaxPrice)(event.target.value)} /></label></div></fieldset>
          <label className="store-stock-filter"><input type="checkbox" checked={availability === 'in_stock'} onChange={(event) => change(setAvailability)(event.target.checked ? 'in_stock' : '')} /> In stock only</label>
          <button className="store-show-results" type="button" onClick={() => setFiltersOpen(false)}>Show products</button>
        </aside>
        <div className="store-results" ref={resultsRef}>
          {error && <p role="alert" className="store-alert">{error}</p>}
          <div className="store-grid" aria-busy={loading}>{data?.products.map((product) => <Link className="store-card" key={product.id} href={`/store/product/${product.slug || product.id}`}><div className="store-card-image">{product.image ? <img src={product.image} alt={product.title} loading="lazy" referrerPolicy="no-referrer" /> : <span>{product.brand || SHOP.shortName}</span>}<span className="store-card-arrow" aria-hidden="true">↗</span></div><small>{product.brand || product.category}</small><h2>{product.title}</h2><p>{cash(product.price)}</p></Link>)}</div>
          {data && !data.products.length && !loading && <div className="store-empty"><h2>No products found</h2><p>Try another category or clear the filters.</p><button type="button" onClick={clear}>Clear filters</button></div>}
          {data && (page > 1 || data.has_more) && <nav className="store-pagination" aria-label="Product pages"><button type="button" disabled={page === 1 || loading} onClick={() => goTo(page - 1)}>Previous</button><span>Page {page}</span><button type="button" disabled={!data.has_more || loading} onClick={() => goTo(page + 1)}>Next</button></nav>}
        </div>
      </div>
    </section>
  </>;
}
