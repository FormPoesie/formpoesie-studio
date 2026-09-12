import type { Metadata } from 'next';
import { Oxygen, Cormorant_Infant } from 'next/font/google';
import './globals.css';
import { VersionGuard } from '@/components/version-guard';

const oxygen = Oxygen({
  variable: '--font-oxygen',
  weight: ['300', '400', '700'],
  subsets: ['latin'],
});

const cormorant = Cormorant_Infant({
  variable: '--font-cormorant',
  weight: ['500', '600'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'FORMPOESIE STUDIO',
  description:
    'Interne Arbeitsfläche für Inventar, Verkäufe, Etsy, Produktbilder und News.',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png', sizes: '96x96' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.png',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${oxygen.variable} ${cormorant.variable} antialiased`}>
        <VersionGuard />
        {children}
      </body>
    </html>
  );
}
