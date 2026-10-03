import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Instrument_Sans } from 'next/font/google';
import { JsonLd } from './components/JsonLd.tsx';
import { APP_ID, PERSON_ID, SITE_URL, WEBSITE_ID } from './lib/seo.ts';
import './globals.css';

// Mono numbers render at 400 and 600 only (bold totals resolve to 600); sans uses all four.
const sans = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-ui', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-num', display: 'swap' });

const siteUrl = SITE_URL;
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
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: 'SplitSnap',
      url: siteUrl,
      description,
      inLanguage: 'en',
      publisher: { '@id': PERSON_ID },
      author: { '@id': PERSON_ID },
    },
    {
      '@type': 'WebApplication',
      '@id': APP_ID,
      name: 'SplitSnap',
      url: siteUrl,
      description,
      isPartOf: { '@id': WEBSITE_ID },
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      screenshot: `${siteUrl}/opengraph-image.png`,
      featureList: [
        'Reads line items, tax, tip and totals from a receipt photo',
        'Checks the receipt maths and flags lines that do not add up',
        'Assign items to people, with shared dishes split evenly',
        'Splits tax, tip, service and discounts by what each person had or evenly',
        'Share the split as text, an image or a link',
      ],
      author: { '@id': PERSON_ID },
    },
    {
      '@type': 'Person',
      '@id': PERSON_ID,
      name: 'Sahil Chalke',
      url: 'https://sahilchalke.com',
      sameAs: ['https://github.com/Sahilll15', 'https://x.com/chalke1015'],
    },
  ],
};

export const viewport: Viewport = { themeColor: '#1b2a6b', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <JsonLd data={jsonLd} />
        {children}
      </body>
    </html>
  );
}
