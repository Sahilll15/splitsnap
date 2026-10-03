import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Instrument_Sans } from 'next/font/google';
import './globals.css';

const sans = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-ui', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-num', display: 'swap' });

const siteUrl = 'https://splitsnap-sandy.vercel.app';
const title = 'SplitSnap: split a restaurant bill from a receipt photo';
const description =
  'Snap a receipt photo, check the items it read, tap who had what, and send everyone their exact share of the bill, with tax and tip split to the cent.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  title: { default: title, template: '%s | SplitSnap' },
  description,
  keywords: ['split the bill', 'bill splitter', 'split restaurant bill', 'receipt scanner', 'split a receipt', 'split check app', 'tip and tax split'],
  applicationName: 'SplitSnap',
  authors: [{ name: 'Sahil Chalke', url: 'https://sahilchalke.com' }],
  creator: 'Sahil Chalke',
  openGraph: { type: 'website', siteName: 'SplitSnap', title, description, url: '/', locale: 'en_US' },
  twitter: { card: 'summary_large_image', creator: '@chalke1015', title, description },
  robots: { index: true, follow: true },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'SplitSnap',
  url: siteUrl,
  description,
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  author: {
    '@type': 'Person',
    name: 'Sahil Chalke',
    url: 'https://sahilchalke.com',
    sameAs: ['https://github.com/Sahilll15', 'https://x.com/chalke1015'],
  },
};

export const viewport: Viewport = { themeColor: '#1b2a6b', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
        {children}
      </body>
    </html>
  );
}
