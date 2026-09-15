import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';
import { appData } from '@/lib/ui/server';
import { AppProvider } from '@/lib/ui/app-provider';
import { Toasts } from '@/components/ui/interactions';
import { DesktopShell } from '@/components/shell/desktop';
import { MobileShell } from '@/components/shell/mobile';
import { categories , onboardedStates} from '@/repo/catalog';
import { popularSearches } from '@/repo/cart';
import { SITE } from '@/lib/ui/seo';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — Legally permitted exotic animals from verified breeders`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: ['exotic animals for sale', 'reptiles for sale', 'ball python breeder', 'legal exotic pets USA', 'verified breeders'],
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    title: `${SITE.name} — Legally permitted exotic animals`,
    description: SITE.description,
    images: [{ url: '/img/og-cover.jpg', width: 1200, height: 630 }],
    locale: 'en_US',
  },
  twitter: { card: 'summary_large_image', title: SITE.name, description: SITE.description },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#F7F7F5',
  viewportFit: 'cover',
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { user, experience, locale, currency, badges } = appData();
  const cats = (categories(true) as { slug: string; name: string; blurb: string | null; icon: string | null; animal_count: number }[]).slice(0, 8);
  const topSearches = popularSearches(6).map((s) => s.query);
  const states = onboardedStates();
  return (
    <html lang={locale} data-experience={experience}>
      <body className={experience === 'mobile' ? 'fx-mobile' : 'fx-desktop'} style={{ background: '#F7F7F5', color: '#151515' }}>
        <AppProvider user={user} experience={experience} locale={locale} currency={currency} badges={badges}>
          {experience === 'mobile' ? <MobileShell>{children}</MobileShell> : <DesktopShell categories={cats} topSearches={topSearches} states={states}>{children}</DesktopShell>}
          <Toasts />
          <noscript>
            <p style={{ padding: 16, textAlign: 'center' }}>FAUNAL needs JavaScript for cart, checkout and messaging. Browsing the catalogue works without it.</p>
          </noscript>
        </AppProvider>
      </body>
    </html>
  );
}
