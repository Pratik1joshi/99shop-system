import { formatCurrency } from '@/lib/currency';
import { whatsappHref } from '@/lib/restaurant-info.js';
import { orderMessageFor } from '@/lib/storefront-links.js';

/**
 * One product tile. The whole card is the order link — tapping it opens
 * WhatsApp with the product name already typed, which is how this shop takes
 * orders.
 */
export default function ProductCard({ product }) {
  return (
    <a
      className="card"
      href={whatsappHref(orderMessageFor(product.name))}
      target="_blank"
      rel="noopener"
    >
      <div className="imgwrap">
        {product.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={product.image} alt={product.name} loading="lazy" />
        ) : null}
      </div>
      <div className="body">
        <div className="pname">{product.name}</div>
        <div className="pdesc">{product.description}</div>
        <div className="pfoot">
          <span className="price-tag">
            {product.price > 0 ? formatCurrency(product.price) : 'Message for price'}
          </span>
          <span className="order-chip">Order →</span>
        </div>
      </div>
    </a>
  );
}
