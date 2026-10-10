import Link from 'next/link';
import { notFound } from 'next/navigation';
import CategoryCatalog from '@/components/storefront/category-catalog.jsx';
import JsonLd from '@/components/storefront/json-ld.jsx';
import { getCategoryBySlug, getProductsByCategoryId, getStorefrontCategories, isOnlineOrderingEnabled } from '@/lib/storefront.js';
import { getSiteContent, whatsappLink } from '@/lib/site-content.js';
import { breadcrumbLd, describe, itemListLd, pageMetadata, siteOrigin } from '@/lib/seo.js';
import Database from '@/lib/db/index';

export const dynamic = 'force-dynamic';

/** The owner's own category text when written; otherwise one plain, honest sentence. */
function categoryIntro(category, content) {
  if (category.description) return category.description;
  return `Shop cute ${category.name.toLowerCase()} from ${content['shop.name']} in ${content['shop.city']}. New pieces arrive often — see what's in today.`;
}

/**
 * One page per catalogue category. Adding a category in the back office puts a
 * new page here automatically — nothing to wire up by hand.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const [category, content, origin] = await Promise.all([
    getCategoryBySlug(slug),
    getSiteContent(Database.getInstance()),
    siteOrigin(),
  ]);
  // Thrown here, before the page streams, so the response carries a real 404 status.
  if (!category) notFound();
  return pageMetadata({
    origin,
    content,
    title: `${category.name} in ${content['shop.city']} | ${content['shop.short_name']}`,
    description: describe(categoryIntro(category, content), content),
    path: `/shop/${category.slug}`,
    image: category.image,
    imageAlt: `${category.name} from ${content['shop.name']}`,
  });
}

export default async function CategoryPage({ params }) {
  const { slug } = await params;
  const [category, content, origin] = await Promise.all([
    getCategoryBySlug(slug),
    getSiteContent(Database.getInstance()),
    siteOrigin(),
  ]);
  if (!category) notFound();

  const [products, onlineEnabled, categories] = await Promise.all([getProductsByCategoryId(category.id), isOnlineOrderingEnabled(), getStorefrontCategories()]);

  return (
    <>
      <JsonLd data={breadcrumbLd(origin, [{ name: 'Home', path: '/' }, { name: category.name, path: `/shop/${category.slug}` }])} />
      {products.length > 0 && <JsonLd data={itemListLd(origin, category.name, products)} />}
      <div className="page-banner">
        <div className="wrap">
          <div className="inner">
            <nav className="crumb" aria-label="Breadcrumb">
              <Link href="/">Home</Link> / <span aria-current="page">{category.name}</span>
            </nav>
            <h1>{category.name}</h1>
            <p>{categoryIntro(category, content)}</p>
          </div>
        </div>
      </div>

      <CategoryCatalog category={category} categories={categories} products={products} onlineEnabled={onlineEnabled} emptyNote={content['category.empty_note']} />

      <section className="wrap">
        <div className="cta-band">
          <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>{content['category.cta_title']}</h2>
          <p>{content['category.cta_body']}</p>
          {onlineEnabled ? <Link className="btn btn-pink" href="/store">Shop online →</Link> : <a
            className="btn btn-pink"
            href={whatsappLink(content, content['contact.order_message'])}
            target="_blank"
            rel="noopener"
          >
            {content['category.cta_button']}
          </a>}
        </div>
      </section>
    </>
  );
}
