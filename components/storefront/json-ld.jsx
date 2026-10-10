import { jsonLdString } from '@/lib/seo.js';

/** Structured data block. Renders nothing for null so callers can pass optional markup. */
export default function JsonLd({ data }) {
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
