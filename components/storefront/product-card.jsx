import Link from 'next/link';
import { formatCurrency } from '@/lib/currency';

/**
 * Product tile with online ordering for published items and a contact fallback.
 */
export default function ProductCard({ product, onlineEnabled = false, headingLevel = 3, priority = false }) {
  const Heading = `h${headingLevel}`;
  const canOrderOnline = onlineEnabled && product.onlineReady;
  return (
    <article className="card">
      <Link className="card-main" href={`/products/${product.slug}`}>
        <div className="imgwrap">
          {canOrderOnline && <span className="online-badge">Order online</span>}
          {product.image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={product.image} alt={product.name} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} decoding="async" width="600" height="600" />
          ) : (
            <div className="product-photo-placeholder" aria-label="Product photo coming soon">
              <span aria-hidden="true">{product.name.slice(0, 1)}</span>
              <small>Photo coming soon</small>
            </div>
          )}
        </div>
        <div className="body">
          <Heading className="pname">{product.name}</Heading>
          <p className="pdesc">{product.summary || product.description}</p>
        </div>
      </Link>
      <div className="pfoot card-foot">
        <span className="price-tag">
          {product.price > 0 ? formatCurrency(product.price) : canOrderOnline ? 'See price' : 'Message for price'}
        </span>
        <Link className="order-chip" href={`/products/${product.slug}`} aria-label={canOrderOnline ? `Choose ${product.name} and add to bag` : `View ${product.name}`}>{canOrderOnline ? 'Choose & add →' : 'View item →'}</Link>
      </div>
    </article>
  );
}
