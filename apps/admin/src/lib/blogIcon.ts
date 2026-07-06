import * as Lucide from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Zoekt een lucide-icoon op naam (bv. "TrendingUp"). Valt terug op BookOpen als de naam onbekend is,
// zodat een door de agent voorgestelde categorie met een vreemde icoonnaam nooit crasht.
export function iconByName(name?: string | null): LucideIcon {
  if (name) {
    const found = (Lucide as unknown as Record<string, LucideIcon>)[name];
    if (found) return found;
  }
  return Lucide.BookOpen;
}
