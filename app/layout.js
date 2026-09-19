import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmProvider } from '@/components/ui/confirm'
import { SHOP } from '@/lib/shop-info.js'
import { CalendarSystemProvider } from '@/lib/calendar-context.jsx'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

const SITE_DESCRIPTION = `${SHOP.tagline}. Call ${SHOP.phoneDisplay}.`

// Bump `v` whenever the favicon assets change to bust browser/CDN caches.
const ICON_VERSION = 'km-2'

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || SHOP.siteUrl),
  title: {
    default: `${SHOP.name} | ${SHOP.tagline}`,
    template: `%s | ${SHOP.name}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SHOP.name,
  manifest: `/site.webmanifest?v=${ICON_VERSION}`,
  icons: {
    icon: [{ url: `/images/brand/icon-192.png?v=${ICON_VERSION}`, type: 'image/png', sizes: '192x192' }],
    apple: [{ url: `/images/brand/apple-icon.png?v=${ICON_VERSION}`, type: 'image/png', sizes: '180x180' }],
    shortcut: [{ url: `/images/brand/favicon/favicon.ico?v=${ICON_VERSION}`, type: 'image/x-icon' }],
  },
  openGraph: {
    type: 'website',
    siteName: SHOP.name,
    title: `${SHOP.name} | ${SHOP.tagline}`,
    description: SITE_DESCRIPTION,
    images: [{ url: SHOP.logo, alt: `${SHOP.name} logo` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SHOP.name,
    description: SITE_DESCRIPTION,
    images: [SHOP.logo],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
  },
}

export const viewport = {
  themeColor: SHOP.themeColor,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              const theme = localStorage.getItem('theme') || 'light';
              if (theme === 'dark') {
                document.documentElement.classList.add('dark');
              }
            })();
          `
        }} />
      </head>
      <body className={`font-sans antialiased`}>
        <AuthProvider>
          <CalendarSystemProvider>
            <ToastProvider>
              <ConfirmProvider>
                {children}
              </ConfirmProvider>
            </ToastProvider>
          </CalendarSystemProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
