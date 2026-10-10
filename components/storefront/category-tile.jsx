import Link from 'next/link';
import { categoryHref } from '@/lib/storefront-links.js';

/** Photo card for one category, used on the home page and the all-categories page. */
export default function CategoryTile({ category, onlineEnabled }) {
  return (
    <Link className="cat-tile" href={categoryHref(category, onlineEnabled)}>
      <div className="imgbox">
        {category.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={category.image} alt="" loading="lazy" decoding="async" />
        ) : <span className="cat-placeholder" aria-hidden="true">{category.name.slice(0, 1)}</span>}
        <div className="overlay" />
        <span className="cat-count">{category.productCount ? `${category.productCount} ${category.productCount === 1 ? 'item' : 'items'}` : 'Coming soon'}</span>
      </div>
      <span className="label">
        <span>{category.name}</span> <span className="arrow" aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
