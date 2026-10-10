import { toPublicImageUrl } from '@/lib/public-image-url.js';

const imageVar = (value, fallback) => `url("${toPublicImageUrl(value) || fallback}")`;

/** The layered mascot from the supplied storefront design. */
export default function KittyHero({ content }) {
  return <div className="kitty-stage" aria-label="Cute kitty mascot" style={{
    '--img-kitty': imageVar(content['home.hero_image'], '/storefront/kitty-hero.webp'),
    '--img-cat2': imageVar(content['home.float_image_left'], '/storefront/kitty-tulips.webp'),
    '--img-cat3': imageVar(content['home.float_image_right'], '/storefront/kitty-bow.webp'),
  }}>
    <div className="kitty-glow" aria-hidden="true" />
    <div className="kitty-ped" aria-hidden="true" />
    <div className="kitty-3d">
      <div className="kitty-img" role="img" aria-label="Kitty holding a teddy bear" />
      <div className="kitty-shine" aria-hidden="true" />
    </div>
    <div className="floaty floaty-a" role="img" aria-label="Kitty with tulips" />
    <div className="floaty floaty-b" role="img" aria-label="Kitty with a bow" />
    <span className="spark s1" aria-hidden="true">✦</span>
    <span className="spark s2" aria-hidden="true">✦</span>
    <span className="spark s3" aria-hidden="true">✦</span>
    <span className="spark s4" aria-hidden="true">✦</span>
  </div>;
}
