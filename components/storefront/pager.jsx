import { Fragment } from 'react';
import Link from 'next/link';

/** First, last and the pages beside the current one; `null` marks a gap of two or more pages. */
function pageList(page, pages) {
  const keep = (n) => n === 1 || n === pages || Math.abs(n - page) <= 1;
  const list = [];
  for (let n = 1; n <= pages; n += 1) {
    if (keep(n) || (keep(n - 1) && keep(n + 1))) list.push(n);
    else if (list[list.length - 1] !== null) list.push(null);
  }
  return list;
}

/**
 * Numbered pagination. Pass `href(n)` for crawlable links between server
 * pages, or `onChange(n)` to page through a list already in the browser.
 */
export default function Pager({ page, pages, href, onChange, label = 'Pages' }) {
  if (pages <= 1) return null;
  const go = (n, text, props = {}) => (href
    ? <Link href={href(n)} {...props}>{text}</Link>
    : <button type="button" onClick={() => onChange(n)} {...props}>{text}</button>);
  return (
    <nav className="sf-pager" aria-label={label}>
      {page > 1
        ? go(page - 1, '‹ Prev', { className: 'sf-pager-step', 'aria-label': 'Previous page' })
        : <span className="sf-pager-step" aria-disabled="true">‹ Prev</span>}
      {pageList(page, pages).map((n, index) => (n === null
        ? <span key={`gap-${index}`} className="sf-pager-gap" aria-hidden="true">…</span>
        : <Fragment key={n}>{n === page ? <span aria-current="page">{n}</span> : go(n, n, { 'aria-label': `Page ${n}` })}</Fragment>))}
      {page < pages
        ? go(page + 1, 'Next ›', { className: 'sf-pager-step', 'aria-label': 'Next page' })
        : <span className="sf-pager-step" aria-disabled="true">Next ›</span>}
    </nav>
  );
}
