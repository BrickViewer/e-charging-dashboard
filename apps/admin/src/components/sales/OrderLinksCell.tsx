import { ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isSafeHttpUrl, urlHost } from "@/lib/url";

// Bestellinks bij een catalogusartikel: één klik naar de bestelpagina van de
// hoofdleverancier, en — bewust onopvallend — een "+n" voor de alternatieven.

export type ExtraLink = { label: string; url: string };

/** Defensieve lezer voor het jsonb-veld: alles wat geen nette link is, valt weg. */
export function parseExtraLinks(value: unknown): ExtraLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (l): l is ExtraLink =>
        !!l && typeof l === "object" && typeof (l as ExtraLink).url === "string" && isSafeHttpUrl((l as ExtraLink).url),
    )
    .map((l) => ({ label: typeof l.label === "string" && l.label.trim() ? l.label : urlHost(l.url), url: l.url }));
}

const stop = (e: React.MouseEvent) => e.stopPropagation();

export function OrderLinksCell({
  orderUrl,
  extraLinks,
  supplier,
}: {
  orderUrl: string | null;
  extraLinks: unknown;
  supplier: string | null;
}) {
  const primary = orderUrl && isSafeHttpUrl(orderUrl) ? orderUrl : null;
  const extras = parseExtraLinks(extraLinks);
  if (!primary && extras.length === 0) return null;

  // Geen primaire link maar wél alternatieven: promoveer de eerste tot hoofdlink.
  const hoofd = primary ?? extras[0].url;
  const hoofdLabel = primary ? supplier || urlHost(primary) : extras[0].label;
  const rest = primary ? extras : extras.slice(1);

  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <a
        href={hoofd}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        title={`Bestellen bij ${hoofdLabel}`}
        aria-label={`Bestellen bij ${hoofdLabel}`}
        className="text-muted-foreground transition-colors hover:text-primary"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
      {rest.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={stop}
              aria-label={`Nog ${rest.length} ${rest.length === 1 ? "leverancier" : "leveranciers"}`}
              className="rounded px-0.5 text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-primary"
            >
              +{rest.length}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2" onClick={stop}>
            <p className="px-2 pb-1 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Bestellen bij
            </p>
            <div className="grid">
              {[{ label: hoofdLabel, url: hoofd }, ...rest].map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span className="truncate">{l.label}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    {urlHost(l.url)}
                    <ExternalLink className="h-3 w-3" />
                  </span>
                </a>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
