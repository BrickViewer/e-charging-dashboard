// URL-vriendelijke slug uit een titel (accenten weg, spaties → koppeltekens).
export function slugify(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Geschatte leestijd in minuten op basis van platte tekst (≈200 woorden/min).
export function readingMinutes(html: string): number {
  const text = (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  return Math.max(1, Math.round(words / 200));
}
