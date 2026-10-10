'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ProductCard from './product-card.jsx';
import Pager from './pager.jsx';
import { categoryHref } from '@/lib/storefront-links.js';

const PER_PAGE = 12;
const CATEGORY_LIMIT = 8;

export default function CategoryCatalog({ category, categories, products, onlineEnabled, emptyNote }) {
  const [query, setQuery] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [sort, setSort] = useState('featured');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [allCategories, setAllCategories] = useState(false);
  const resultsRef = useRef(null);
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    const filtered = products.filter((product) => (
      (!search || `${product.name} ${product.summary || ''} ${product.description || ''}`.toLowerCase().includes(search)) &&
      (!minPrice || Number(product.price) >= Number(minPrice)) &&
      (!maxPrice || Number(product.price) <= Number(maxPrice)) &&
      (!onlineOnly || product.onlineReady)
    ));
    return filtered.sort((left, right) => {
      if (sort === 'price_asc') return Number(left.price) - Number(right.price);
      if (sort === 'price_desc') return Number(right.price) - Number(left.price);
      if (sort === 'name') return left.name.localeCompare(right.name);
      return Number(onlineEnabled && right.onlineReady) - Number(onlineEnabled && left.onlineReady);
    });
  }, [products, query, minPrice, maxPrice, onlineOnly, sort, onlineEnabled]);
  const activeCount = [query, minPrice, maxPrice, onlineOnly].filter(Boolean).length;
  const clear = () => { setQuery(''); setMinPrice(''); setMaxPrice(''); setOnlineOnly(false); setSort('featured'); setPage(1); };
  // Any filter change starts the results again from the first page.
  const change = (setter) => (value) => { setter(value); setPage(1); };
  const pages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const current = Math.min(page, pages);
  const shown = visible.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const goTo = (next) => { setPage(next); resultsRef.current?.scrollIntoView({ block: 'start' }); };
  const shownCategories = allCategories ? categories : categories.filter((item, index) => index < CATEGORY_LIMIT || item.id === category.id);

  return <section className="wrap shop-section" aria-label={`${category.name} products`}>
    <div className="sf-catalog-toolbar" ref={resultsRef}><div><strong>{category.name}</strong><span>{pages > 1 ? `Showing ${(current - 1) * PER_PAGE + 1}–${(current - 1) * PER_PAGE + shown.length} of ${visible.length} products` : `${visible.length} product${visible.length === 1 ? '' : 's'}`}</span></div><button type="button" className="sf-filter-toggle" aria-expanded={filtersOpen} aria-controls="sf-category-filters" onClick={() => setFiltersOpen((open) => !open)}>Filters{activeCount ? ` (${activeCount})` : ''}</button><label>Sort by<select value={sort} onChange={(event) => change(setSort)(event.target.value)}><option value="featured">Featured</option><option value="name">Name</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label></div>
    <div className="sf-catalog-layout">
      <aside className={`sf-filter-panel${filtersOpen ? ' open' : ''}`} id="sf-category-filters" aria-label="Product filters">
        <div className="sf-filter-heading"><h2>Filter products</h2>{activeCount > 0 && <button type="button" onClick={clear}>Clear all</button>}</div>
        <label>Search<input type="search" placeholder="Search this category" value={query} onChange={(event) => change(setQuery)(event.target.value)} /></label>
        <div className="sf-filter-categories"><strong>Categories</strong>{shownCategories.map((item) => <Link key={item.id} href={categoryHref(item, onlineEnabled)} aria-current={item.id === category.id ? 'page' : undefined}>{item.name}</Link>)}{categories.length > CATEGORY_LIMIT && <button type="button" className="sf-filter-more" aria-expanded={allCategories} onClick={() => setAllCategories((open) => !open)}>{allCategories ? 'Show fewer' : `Show all ${categories.length}`}</button>}</div>
        <div className="sf-filter-price"><strong>Price (Rs)</strong><div><label>From<input type="number" min="0" value={minPrice} onChange={(event) => change(setMinPrice)(event.target.value)} /></label><label>To<input type="number" min="0" value={maxPrice} onChange={(event) => change(setMaxPrice)(event.target.value)} /></label></div></div>
        {onlineEnabled && <label className="sf-filter-check"><input type="checkbox" checked={onlineOnly} onChange={(event) => change(setOnlineOnly)(event.target.checked)} /> Available for online ordering</label>}
        <button className="sf-filter-done" type="button" onClick={() => setFiltersOpen(false)}>Show products</button>
      </aside>
      <div className="sf-catalog-results">{visible.length ? <><div className="grid">{shown.map((product, index) => <ProductCard key={product.id} product={product} onlineEnabled={onlineEnabled} headingLevel={2} priority={current === 1 && index < 2} />)}</div><Pager page={current} pages={pages} onChange={goTo} label={`${category.name} product pages`} /></> : <div className="sf-catalog-empty"><p>{products.length ? 'No products match these filters.' : emptyNote}</p>{products.length > 0 && <button type="button" onClick={clear}>Clear filters</button>}</div>}</div>
    </div>
  </section>;
}
