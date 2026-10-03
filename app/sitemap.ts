import type { MetadataRoute } from 'next';

const base = 'https://splitsnap-sandy.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${base}/`, changeFrequency: 'monthly', priority: 1 },
  ];
}
