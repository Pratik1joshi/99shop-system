import fs from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { getStorefrontCategories } from '@/lib/storefront.js';
import { getSiteContent } from '@/lib/site-content.js';
import Database from '@/lib/db/index';

export const dynamic = 'force-dynamic';

/**
 * The branded card shown when a page without its own photo is shared on
 * WhatsApp, Messenger or Instagram. Words and categories come from the live
 * site, so the card never promises something the shop does not sell.
 */
export async function GET() {
  const [content, categories] = await Promise.all([getSiteContent(Database.getInstance()), getStorefrontCategories().catch(() => [])]);
  const logo = await fs.readFile(path.join(process.cwd(), 'public/storefront/99-shop-by-shahana-logo.jpg'));
  const logoSrc = `data:image/jpeg;base64,${logo.toString('base64')}`;
  const stripe = { height: 26, display: 'flex', backgroundColor: '#FFFFFF', backgroundImage: 'linear-gradient(90deg, #FFC2D1 50%, transparent 50%)', backgroundSize: '26px 26px' };
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#FFF0F5' }}>
        <div style={stripe} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 80px', gap: 60 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={300} height={300} alt="" style={{ borderRadius: 150, border: '10px solid #FFFFFF' }} />
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 700 }}>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 4, color: '#D6316F' }}>{`${content['shop.city'] || 'Surkhet'}, Nepal`.toUpperCase()}</div>
            <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, color: '#4A3350', marginTop: 10 }}>{content['shop.name']}</div>
            <div style={{ fontSize: 38, color: '#8E7A98', marginTop: 14 }}>{content['shop.tagline']}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 30 }}>
              {categories.slice(0, 3).map((category) => (
                <div key={category.slug} style={{ display: 'flex', padding: '10px 22px', borderRadius: 999, background: '#FFFFFF', color: '#B62A5F', fontSize: 26, fontWeight: 700 }}>{category.name}</div>
              ))}
              <div style={{ display: 'flex', padding: '10px 22px', borderRadius: 999, background: '#D6316F', color: '#FFFFFF', fontSize: 26, fontWeight: 700 }}>Order on WhatsApp</div>
            </div>
          </div>
        </div>
        <div style={stripe} />
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=3600' } }
  );
}
