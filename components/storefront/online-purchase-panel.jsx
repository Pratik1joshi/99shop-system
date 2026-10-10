'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { addToBag } from '@/lib/store-bag.js';
import { formatCurrency } from '@/lib/currency';
import VariantOptions, { firstVariantId, priceRange } from './variant-options.jsx';

export function ProductGallery({ images, name }) {
  const photos = [...new Set(images.filter(Boolean))];
  const [active, setActive] = useState(0);
  if (!photos.length) return <div className="product-photo product-photo-empty" role="img" aria-label={`No photo available for ${name}`}>{name}</div>;
  return <div className="product-gallery">
    <figure className="product-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photos[active] || photos[0]} alt={`${name} — photo ${active + 1}`} width="900" height="900" fetchPriority="high" />
    </figure>
    {photos.length > 1 && <div className="product-thumbnails" aria-label="Product photos">{photos.map((photo, index) => <button key={photo} type="button" aria-label={`Show photo ${index + 1}`} aria-pressed={active === index} onClick={() => setActive(index)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo} alt="" loading="lazy" width="88" height="88" />
    </button>)}</div>}
  </div>;
}

export default function OnlinePurchasePanel({ product }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(() => firstVariantId(product.variants));
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const [added, setAdded] = useState(false);
  const variant = product.variants.find((item) => item.id === selectedId);
  const available = Math.floor(Number(variant?.available || 0));

  function choose(id) {
    setSelectedId(id == null ? null : Number(id));
    setQuantity(1);
    setMessage('');
    setAdded(false);
  }

  function add(checkout = false) {
    const result = addToBag(selectedId, quantity, available);
    setMessage(result.message);
    setAdded(result.ok);
    if (result.ok && checkout) router.push('/store/cart');
  }

  return <section className="online-purchase" aria-label="Order this product online">
    <div className="online-purchase-heading"><span>Order online</span><span>No account needed</span></div>
    <p className="online-purchase-price">{variant?.price?.unit_price != null ? formatCurrency(variant.price.unit_price) : priceRange(product.variants, formatCurrency) || 'Price available at checkout'}</p>
    {variant && <p className="online-purchase-stock" data-available={available > 0}>{available > 0 ? `${available} available to order` : 'Currently out of stock'}</p>}
    <VariantOptions variants={product.variants} selectedId={selectedId} onSelect={choose} className="online-purchase-options" />
    <label className="online-purchase-quantity">Quantity<input type="number" min="1" max={Math.min(99, Math.max(1, available))} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(99, Math.floor(Number(event.target.value) || 1))))} /></label>
    <div className="online-purchase-actions"><button type="button" className="btn btn-pink" disabled={!available || quantity > available} onClick={() => add(false)}>Add to bag</button><button type="button" className="btn btn-outline" disabled={!available || quantity > available} onClick={() => add(true)}>Buy now</button></div>
    <p className="online-purchase-message" role="status">{message}{added && <> <Link href="/store/cart">View bag and checkout →</Link></>}</p>
    <p className="online-purchase-footnote">The final price and stock are checked again at checkout. Choose store collection when placing your order.</p>
  </section>;
}
