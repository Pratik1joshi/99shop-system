'use client';
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SHOP } from '@/lib/shop-info.js';
import { addToBag } from '@/lib/store-bag.js';
import { storeFetch } from './store-api.js';
import VariantOptions, { firstVariantId, priceRange } from '@/components/storefront/variant-options.jsx';

const cash = (value) => `Rs ${Number(value || 0).toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const variantLabel = (variant) => variant.attributes?.length
  ? variant.attributes.map((attribute) => `${attribute.name}: ${attribute.value}`).join(' / ')
  : variant.variant_name || 'Standard';

export default function Product({ initial, preview = false }) {
  const router = useRouter();
  const [product, setProduct] = useState(initial);
  const [photo, setPhoto] = useState(null);
  const [selected, setSelected] = useState(() => firstVariantId(initial.variants));
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const variant = product.variants.find((item) => item.id === selected);
  const available = Math.floor(Number(variant?.available || 0));
  const image = photo || product.images.find((item) => Number(item.variant_id) === Number(selected)) || product.images[0];

  function choose(id) { setSelected(id); setPhoto(null); setQuantity(1); setMessage(''); }
  function add(buyNow = false) {
    const result = addToBag(selected, quantity, available);
    setMessage(result.message);
    if (result.ok && buyNow) router.push('/store/cart');
  }
  async function loadOptions() {
    setLoading(true);
    try {
      const next = page + 1;
      const result = await storeFetch(`product?slug=${product.slug || product.id}&page=${next}`);
      setProduct((current) => ({ ...result, variants: [...current.variants, ...result.variants.filter((item) => !current.variants.some((old) => old.id === item.id))] }));
      setPage(next); setMessage('');
    } catch (cause) { setMessage(cause.message); }
    finally { setLoading(false); }
  }

  return <section className="store-product">
    <nav className="store-product-crumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><Link href="/store">All products</Link><span aria-hidden="true">/</span><span aria-current="page">{product.title}</span></nav>
    <div className="store-product-columns">
      <div><div className="store-product-photo">{image ? <img src={image.url} alt={image.alt || product.title} referrerPolicy="no-referrer" /> : <span>{product.brand || SHOP.shortName}</span>}</div>{product.images.length > 1 && <div className="store-gallery" aria-label="Product images">{product.images.map((item, index) => <button key={`${item.url}-${index}`} type="button" aria-label={`View image ${index + 1}`} aria-pressed={image === item} onClick={() => setPhoto(item)}><img src={item.url} alt="" loading="lazy" width="80" height="80" /></button>)}</div>}</div>
      <div className="store-product-details">
        <p className="store-eyebrow">{product.brand || 'THE EVERYDAY COLLECTION'}</p>
        <h1>{product.title}</h1>
        {product.summary && <p className="store-product-summary">{product.summary}</p>}
        <p className="store-price">{variant?.price?.unit_price != null ? cash(variant.price.unit_price) : priceRange(product.variants, cash) || 'Select a variant'} {variant && Number(variant.mrp) > Number(variant.price?.unit_price) && <del>{cash(variant.mrp)}</del>}</p>
        <VariantOptions variants={product.variants} selectedId={selected} onSelect={choose} className="store-options" />
        {product.has_more && <button className="store-more-options" type="button" disabled={loading} onClick={loadOptions}>{loading ? 'Loading…' : 'View more variants'}</button>}
        {variant && <p className="store-stock" data-available={available > 0} role="status">{available > 0 ? `${available} available to order` : 'Currently out of stock'} · {variantLabel(variant)}</p>}
        <div className="store-purchase-row"><label>Quantity<input type="number" min="1" max={Math.min(99, Math.max(1, available))} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Math.floor(Number(event.target.value) || 1))))} /></label><button className="store-primary" type="button" disabled={preview || !available || quantity > available} onClick={() => add(false)}>Add to bag</button><button className="store-buy-now" type="button" disabled={preview || !available || quantity > available} onClick={() => add(true)}>Buy now</button></div>
        <p className="store-order-message" role="status">{message} {message === 'Added to your bag.' && <Link href="/store/cart">View bag →</Link>}</p>
        <p className="store-note">Final price and availability are confirmed at checkout.</p>
        <details open><summary>About this product</summary><p className="store-copy">{product.description || product.summary || product.title}</p></details>
        {product.return_policy && <details><summary>Returns &amp; exchanges</summary><p>{product.return_policy}</p></details>}
      </div>
    </div>
  </section>;
}
