import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FormPoesie Masterbrain',
    short_name: 'FormPoesie',
    description:
      'Inventar, Verkäufe, Märkte, Listings und Content für FormPoesie.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f0e8',
    theme_color: '#1a1a18',
    icons: [
      {
        src: '/favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
