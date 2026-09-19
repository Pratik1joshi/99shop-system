import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductCard from '@/components/storefront/product-card.jsx';
import { getCategoryBySlug, getProductsByCategoryId } from '@/lib/storefront.js';
import { getSiteContent, whatsappLink } from '@/lib/site-content.js';
import Database from '@/lib/db/index';

export const dynamic = 'force-dynamic';

/**
 * One page per catalogue category. Adding a category in the back office puts a
 * new page here automatically — nothing to wire up by hand.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const [category, content] = await Promise.all([
    getCategoryBySlug(slug),
    getSiteContent(Database.getInstance()),
  ]);
  if (!category) return { title: 'Not found' };
  return {
    title: `${category.name} — ${content['shop.name']}`,
    description: category.description || `${category.name} at ${content['shop.name']}.`,
  };
}

export default async function CategoryPage({ params }) {
  const { slug } = await params;
  const [category, content] = await Promise.all([
    getCategoryBySlug(slug),
    getSiteContent(Database.getInstance()),
  ]);
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
              <ProductCard key={product.id} product={product} content={content} />
            ))}
          </div>
        ) : (
          <p>{content['category.empty_note']}</p>
        )}
      </section>

      <section className="wrap">
        <div className="cta-band">
          <h3>{content['category.cta_title']}</h3>
          <p>{content['category.cta_body']}</p>
          <a
            className="btn btn-pink"
            href={whatsappLink(content, content['contact.order_message'])}
            target="_blank"
            rel="noopener"
          >
            {content['category.cta_button']}
          </a>
        </div>
      </section>
    </>
  );
}
