export interface Searchable {
  name: string;
  displayName: string;
  description: string;
}

/** Fuzzy score: higher = better match. 0 = no match. */
export function fuzzyScore(query: string, item: Searchable): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  const name = item.name.toLowerCase();
  const display = item.displayName.toLowerCase();
  const desc = item.description.toLowerCase();

  if (display === q) return 100;
  if (name === q) return 95;

  if (display.startsWith(q)) return 80;
  if (name.startsWith(q)) return 75;

  const words = display.split(/\s+/);
  let wordScore = 0;
  for (const w of words) {
    if (w.toLowerCase().startsWith(q)) wordScore = Math.max(wordScore, 60);
  }
  if (wordScore > 0) return wordScore;

  if (display.includes(q)) return 50;
  if (name.includes(q)) return 45;
  if (desc.includes(q)) return 30;

  let qi = 0;
  for (let i = 0; i < display.length && qi < q.length; i++) {
    if (display[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 20 - (display.length - q.length) * 0.1;

  return 0;
}

export function fuzzySearch<T extends Searchable>(query: string, items: T[]): T[] {
  if (!query.trim()) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(query, item) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}
