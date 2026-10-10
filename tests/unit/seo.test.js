import test from 'node:test';
import assert from 'node:assert/strict';
import { businessGraph, describe, productLd, snippet } from '../../lib/seo.js';
import { CONTENT_DEFAULTS } from '../../lib/site-content.js';

const content = CONTENT_DEFAULTS;
const origin = 'https://shop.test';

test('short owner copy gets a plain where-and-how sentence; long copy is kept', () => {
  assert.equal(describe('Claw clips, cloud clips and bows', content), 'Claw clips, cloud clips and bows. From 99 Shop by Shahana in Surkhet, order easily on WhatsApp.');
  const long = 'x'.repeat(200);
  assert.ok(describe(long, content).length <= 158);
  assert.ok(snippet('word '.repeat(60)).endsWith('…'));
});

test('no Product markup without a real price, and never a rating', () => {
  assert.equal(productLd(origin, content, { name: 'Mystery Mix', slug: 'mystery-mix', price: 0, available: true }), null);
  const ld = productLd(origin, content, { name: 'Clip', slug: 'clip', price: 99, available: true, image: '/storefront/a.jpg' });
  assert.equal(ld.offers.price, '99.00');
  assert.equal(ld.offers.priceCurrency, 'NPR');
  assert.equal(ld.aggregateRating, undefined);
  assert.equal(ld.image[0], 'https://shop.test/storefront/a.jpg');
});

test('business entity never invents a street address or hours', () => {
  const [business, website] = businessGraph(origin, content)['@graph'];
  assert.equal(business['@type'], 'OnlineStore');
  assert.equal(business.address.streetAddress, undefined);
  assert.equal(business.address.addressLocality, 'Surkhet');
  assert.equal(business.openingHours, undefined);
  assert.deepEqual(business.sameAs, ['https://www.instagram.com/99shop_surkhet', 'https://www.tiktok.com/@99shop_surkhet']);
  assert.equal(website.publisher['@id'], business['@id']);
  const withShop = businessGraph(origin, { ...content, 'contact.street_address': 'New Road' })['@graph'][0];
  assert.equal(withShop['@type'], 'Store');
  assert.equal(withShop.address.streetAddress, 'New Road');
});
