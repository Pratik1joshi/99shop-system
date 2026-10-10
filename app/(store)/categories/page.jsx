import Link from 'next/link';
import CategoryTile from '@/components/storefront/category-tile.jsx';
import Pager from '@/components/storefront/pager.jsx';
import { getStorefrontCategories, isOnlineOrderingEnabled } from '@/lib/storefront.js';
import { getSiteContent } from '@/lib/site-content.js';
import { pageMetadata, siteOrigin } from '@/lib/seo.js';
import Database from '@/lib/db/index';

export const dynamic = 'force-dynamic';

const PER_PAGE = 12;

const pagePath = (page) => (page > 1 ? `/categories?page=${page}` : '/categories');
const pageNumber = (value) => Math.max(1, Math.trunc(Number(value)) || 1);

export async function generateMetadata({ searchParams }) {
  const [content, origin, { page }] = await Promise.all([getSiteContent(Database.getInstance()), siteOrigin(), searchParams]);
  return pageMetadata({
    origin,
    content,
    title: `All categories | ${content['shop.short_name']}`,
    description: `Browse every category at ${content['shop.name']} in ${content['shop.city']}.`,
    path: pagePath(pageNumber(page)),
  });
}

/** Every storefront category, twelve to a page, so the home page can show only a few. */
export default async function CategoriesPage({ searchParams }) {
  const [categories, onlineEnabled, params] = await Promise.all([getStorefrontCategories(), isOnlineOrderingEnabled(), searchParams]);
  const pages = Math.max(1, Math.ceil(categories.length / PER_PAGE));
  const page = Math.min(pages, pageNumber(params.page));
  const shown = categories.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <div className="page-banner">
        <div className="wrap">
          <div className="inner">
            <nav className="crumb" aria-label="Breadcrumb">
              <Link href="/">Home</Link> / <span aria-current="page">Categories</span>
            </nav>
            <h1>All categories</h1>
            <p>{categories.length} {categories.length === 1 ? 'category' : 'categories'} of cute little things to explore.</p>
          </div>
        </div>
      </div>
      <section className="wrap shop-section" aria-label="Categories">
        <div className="cat-grid">
          {shown.map((category) => <CategoryTile key={category.slug} category={category} onlineEnabled={onlineEnabled} />)}
        </div>
        <Pager page={page} pages={pages} href={pagePath} label="Category pages" />
      </section>
    </>
  );
}
