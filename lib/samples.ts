export type Sample = { id: string; title: string; blurb: string; image: string; people: string[] };

// Each sample has a saved result from a real scan at /samples/<id>.json, so trying one costs nothing.
export const SAMPLES: Sample[] = [
  { id: 'osteria-lume', title: 'Osteria Lume', blurb: 'Dinner for 4, tip written in pen', image: '/samples/osteria-lume.jpg', people: ['Ana', 'Ben', 'Chloe', 'Dev'] },
  { id: 'tanuki-ramen', title: 'Tanuki Ramen Bar', blurb: 'London, VAT included, service charge', image: '/samples/tanuki-ramen.jpg', people: ['Maya', 'Sam', 'Theo'] },
  { id: 'cafe-marigold', title: 'Café Marigold', blurb: 'Handwritten bill with a maths slip', image: '/samples/cafe-marigold.jpg', people: ['Inês', 'Rui'] },
];

export const PERSON_COLORS = ['#e8590c', '#2563eb', '#0d9488', '#7c3aed', '#b45309', '#db2777', '#15803d', '#475569'];

export function nextColor(used: string[]): string {
  return PERSON_COLORS.find((c) => !used.includes(c)) ?? PERSON_COLORS[used.length % PERSON_COLORS.length];
}
