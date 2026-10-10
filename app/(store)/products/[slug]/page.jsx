import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductCard from '@/components/storefront/product-card.jsx';
import JsonLd from '@/components/storefront/json-ld.jsx';
import { WhatsappIcon } from '@/components/storefront/icons.jsx';
import { getProductBySlug, getRelatedProducts, isOnlineOrderingEnabled } from '@/lib/storefront.js';
import { getSiteContent, orderMessageFor, whatsappLink } from '@/lib/site-content.js';
import { breadcrumbLd, describe, pageMetadata, productLd, siteOrigin, snippet } from '@/lib/seo.js';
import { formatCurrency } from '@/lib/currency';
import Database from '@/lib/db/index';
import { publicProduct } from '@/lib/retail-storefront.js';
import OnlinePurchasePanel, { ProductGallery } from '@/components/storefront/online-purchase-panel.jsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const [product, content, origin] = await Promise.all([
    getProductBySlug(slug),
    getSiteContent(Database.getInstance()),
    siteOrigin(),
  ]);
  // Thrown here, before the page streams, so the response carries a real 404 status.
  if (!product) notFound();
  const meta = pageMetadata({
    origin,
    content,
    title: product.seoTitle || `${product.name} | ${content['shop.short_name']} ${content['shop.city']}`,
    description: product.seoDescription ? snippet(product.seoDescription) : describe(product.summary || product.description, content),
    path: `/products/${product.slug}`,
    image: product.image,
    imageAlt: `${product.name} from ${content['shop.name']}`,
  });
  // A switched-off product keeps its address for shared links, but stays out of search.
  return product.available ? meta : { ...meta, robots: { index: false, follow: true } };
}

export default async function ProductPage({ params }) {
  const { slug } = await params;
  const [product, content, origin] = await Promise.all([
    getProductBySlug(slug),
    getSiteContent(Database.getInstance()),
    siteOrigin(),
  ]);
  if (!product) notFound();

  const [related, onlineEnabled] = await Promise.all([product.available ? getRelatedProducts(product) : [], isOnlineOrderingEnabled()]);
  const canOrderOnline = product.available && product.onlineReady && onlineEnabled;
  const onlineProduct = canOrderOnline ? await publicProduct(Database.getInstance(), product.slug) : null;
  const orderHref = whatsappLink(content, orderMessageFor(content, product.name));
  const crumbs = [{ name: 'Home', path: '/' }];
  if (product.categorySlug) crumbs.push({ name: product.categoryName, path: `/shop/${product.categorySlug}` });
  crumbs.push({ name: product.name, path: `/products/${product.slug}` });

  return (
    <>
      <JsonLd data={breadcrumbLd(origin, crumbs)} />
      {product.available && <JsonLd data={productLd(origin, content, product)} />}
      <div className="page-banner" style={{ paddingBottom: '10px' }}>
        <div className="wrap">
          <nav className="crumb" aria-label="Breadcrumb" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
            {crumbs.map((crumb, index) => index < crumbs.length - 1
              ? <span key={crumb.path}><Link href={crumb.path}>{crumb.name}</Link> / </span>
              : <span key={crumb.path} aria-current="page">{crumb.name}</span>)}
          </nav>
        </div>
      </div>

      <article className="wrap product-page">
        <ProductGallery images={[product.image, ...(onlineProduct?.images || []).map((image) => image.url)]} name={product.name} />

        <div className="product-info">
          {product.categorySlug && <Link className="product-cat" href={`/shop/${product.categorySlug}`}>{product.categoryName}</Link>}
          <h1>{product.name}</h1>
          {product.available && !canOrderOnline ? (
            <p className="product-price">
              {product.price > 0 ? formatCurrency(product.price) : 'Price on request'}
              <small>This item is not available for online checkout yet.</small>
            </p>
          ) : !product.available ? (
            <p className="sold-out">Not available right now — ask us about a restock</p>
          ) : null}
          {(product.description || product.summary) && <p className="product-desc">{product.description || product.summary}</p>}

          {onlineProduct ? <OnlinePurchasePanel product={onlineProduct} /> : <div className="product-actions">
            {onlineEnabled && <Link className="btn btn-pink" href="/store">Shop products available online →</Link>}
            <a className={onlineEnabled ? 'btn btn-outline' : 'btn btn-pink'} href={orderHref} target="_blank" rel="noopener"><WhatsappIcon size={17} /> Ask about this item</a>
            {product.categorySlug && <Link className="btn btn-outline" href={`/shop/${product.categorySlug}`}>More {product.categoryName}</Link>}
          </div>}

          <dl className="product-facts">
            <div><dt>How to buy</dt><dd>{canOrderOnline ? 'Choose your option and quantity here, add it to your bag, and check out as a guest.' : 'This item is not published for online checkout. You can ask us about availability.'}</dd></div>
            <div><dt>Delivery</dt><dd>{content['contact.delivery_note']}</dd></div>
            <div><dt>Questions</dt><dd>See our <Link href="/contact">contact &amp; ordering page</Link>.</dd></div>
          </dl>
        </div>
      </article>

      {related.length > 0 && (
        <section className="wrap shop-section related" aria-labelledby="related-heading">
          <h2 id="related-heading">You may also like</h2>
          <div className="grid">
            {related.map((item) => <ProductCard key={item.id} product={item} content={content} onlineEnabled={onlineEnabled} />)}
          </div>
        </section>
      )}
    </>
  );
}
