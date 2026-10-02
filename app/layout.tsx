import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Instrument_Sans } from 'next/font/google';
import './globals.css';

const sans = Instrument_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-ui', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-num', display: 'swap' });

export const metadata: Metadata = {
  title: 'SplitSnap: split a restaurant bill from a photo',
  description: 'Snap the receipt, check what was read, tap who had what, and send everyone their exact share.',
};

export const viewport: Viewport = { themeColor: '#1b2a6b', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
