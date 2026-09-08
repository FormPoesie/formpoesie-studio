import type { Metadata } from 'next';
import { Oxygen, Cormorant_Infant } from 'next/font/google';
import './globals.css';

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
  title: 'FormPoesie Masterbrain',
  description:
    'Zentrale Arbeitsfläche für Inventar, Etsy-Listings, Produktbilder und den automatisierten News-Kalender.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${oxygen.variable} ${cormorant.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
