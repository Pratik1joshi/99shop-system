import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = new URL('../public/storefront/99-shop-mark.svg', import.meta.url);
const faviconDir = new URL('../public/images/brand/favicon/', import.meta.url);
const iconSizes = [16, 32, 48, 192, 512];

for (const size of iconSizes) {
  const output = await sharp(fileURLToPath(source)).resize(size, size).png().toBuffer();
  await writeFile(new URL(`icon-${size}.png`, faviconDir), output);
  if (size <= 48) await writeFile(new URL(`favicon-${size}x${size}.png`, faviconDir), output);
}

await sharp(fileURLToPath(source)).resize(180, 180).png().toFile(fileURLToPath(new URL('apple-touch-icon.png', faviconDir)));
await sharp(fileURLToPath(source)).resize(512, 512).png().toFile(fileURLToPath(new URL('../app/icon.png', import.meta.url)));

// PNG-encoded ICO is supported by modern browsers and stays crisp at 32px.
const png = await readFile(new URL('icon-32.png', faviconDir));
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2); // icon image
header.writeUInt16LE(1, 4); // one image
header[6] = 32;
header[7] = 32;
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(header.length, 18);
await writeFile(new URL('favicon.ico', faviconDir), Buffer.concat([header, png]));
