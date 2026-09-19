import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductCard from '@/components/storefront/product-card.jsx';
import { getCategoryBySlug, getProductsByCategoryId } from '@/lib/storefront.js';
import { GENERIC_ORDER_MESSAGE } from '@/lib/storefront-links.js';
import { RESTAURANT, whatsappHref } from '@/lib/restaurant-info.js';

export const dynamic = 'force-dynamic';

/**
 * One page per catalogue category. Adding a category in the back office puts a
 * new page here automatically — nothing to wire up by hand.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: 'Not found' };
  return {
    title: `${category.name} — ${RESTAURANT.name}`,
    description: category.description || `${category.name} at ${RESTAURANT.name}.`,
  };
}

export default async function CategoryPage({ params }) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const products = await getProductsByCategoryId(category.id);

  return (
    <>
      <div className="page-banner">
        <div className="wrap">
          <div className="inner">
            <div className="crumb">
              <Link href="/">Home</Link> / {category.name}
            </div>
            <h1>{category.name}</h1>
            {category.description ? <p>{category.description}</p> : null}
          </div>
        </div>
      </div>

      <section className="wrap shop-section">
        {products.length > 0 ? (
          <div className="grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p>Nothing in this category right now — message us and we&apos;ll tell you what&apos;s in.</p>
        )}
      </section>

      <section className="wrap">
        <div className="cta-band">
          <h3>Didn&apos;t find your favorite?</h3>
          <p>We restock every week — ask us what&apos;s fresh.</p>
          <a
            className="btn btn-pink"
            href={whatsappHref(GENERIC_ORDER_MESSAGE)}
            target="_blank"
            rel="noopener"
          >
            Ask on WhatsApp
          </a>
        </div>
      </section>
    </>
  );
}
