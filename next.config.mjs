/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep production builds separate from the active development server.
  distDir: process.env.NEXT_DIST_DIR || (process.env.NODE_ENV === 'production' ? '.next-production' : '.next'),
  images: {
    unoptimized: true,
    remotePatterns: [],
  },
  async rewrites() {
    return {beforeFiles:[{source:'/uploads/receipts/:path*',destination:'/api/media/receipts/:path*'}],afterFiles:[
      // Uploaded images (UPLOADS_DIR) via media route — /uploads/menu/*.jpg in prod.
      {
        source: '/uploads/:path*',
        destination: '/api/media/:path*',
      },
    ]};
  },
};

export default nextConfig;
