import { slugify } from "./slug";

// Vaste categorie-taxonomie voor blogs/kennisbank — exact één schrijfwijze per
// categorie (consistente casing, stabiele slug voor URLs/filters).
export type BlogCategory = { label: string; slug: string };

export const BLOG_CATEGORIES: BlogCategory[] = [
  { label: "Opbrengsten & verdienmodellen", slug: "opbrengsten-verdienmodellen" },
  { label: "ERE-certificaten", slug: "ere-certificaten" },
  { label: "Laadpalen & hardware", slug: "laadpalen-hardware" },
  { label: "Voor vastgoedeigenaren", slug: "voor-vastgoedeigenaren" },
  { label: "Wetgeving & regelgeving", slug: "wetgeving-regelgeving" },
];

// Zoek de canonieke categorie bij een (mogelijk afwijkend gespelde) ruwe waarde.
export function canonicalCategory(raw: string | null | undefined): BlogCategory | null {
  if (!raw) return null;
  const s = slugify(raw);
  return BLOG_CATEGORIES.find((c) => c.slug === s || slugify(c.label) === s) ?? null;
}

// Slug bij een categorie-label (canoniek indien bekend, anders geslugificeerd).
export function categorySlug(label: string | null | undefined): string | null {
  if (!label) return null;
  return canonicalCategory(label)?.slug ?? slugify(label);
}
