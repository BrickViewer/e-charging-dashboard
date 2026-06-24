import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { renderOfferPages, awaitNodeImages, type OfferPdfData, type OfferSignature } from "@/services/offerPdf";
import { PAGE_W, PAGE_H } from "@/services/offerTemplate";
import { cn } from "@/lib/utils";

const PAD = 32; // horizontale padding van de scroll-area (px-4 = 2×16)
const clampZoom = (z: number) => Math.min(3, Math.max(0.5, Math.round(z * 100) / 100));

// Live, pixel-getrouwe preview van de offerte: rendert exact dezelfde A4-pagina-nodes
// (buildOfferPages) die ook naar de PDF worden gerasterd. Een documentviewer met zoom die
// de beschikbare hoogte vult; herpagineert automatisch (paginateLetter) als de tekst wijzigt.
export function OfferPreview({ data, signature, className }: {
  data: OfferPdfData;
  signature?: OfferSignature;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoom] = useState(1); // 1 = passend in de breedte

  // Debounce + cancellatie op een geserialiseerde key (niet op object-identiteit:
  // de parent bouwt pdfData() elke render opnieuw → anders een oneindige re-render-lus).
  const key = useMemo(() => JSON.stringify([data, signature]), [data, signature]);

  // Effectieve schaal = passend-in-breedte × zoom; toepassen op elke gemounte pagina.
  const applyScale = () => {
    const scroll = scrollRef.current;
    const stage = stageRef.current;
    if (!scroll || !stage) return;
    const avail = Math.max(0, scroll.clientWidth - PAD);
    const fit = Math.min(1, (avail || PAGE_W) / PAGE_W);
    const scale = fit * zoom;
    for (const wrap of Array.from(stage.children) as HTMLElement[]) {
      const page = wrap.firstElementChild as HTMLElement | null;
      if (!page) continue;
      page.style.transform = `scale(${scale})`;
      page.style.transformOrigin = "top left";
      // Transform verandert de layout-box niet → wrapper expliciet op geschaalde maat zetten.
      wrap.style.width = `${PAGE_W * scale}px`;
      wrap.style.height = `${PAGE_H * scale}px`;
    }
  };

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const pages = await renderOfferPages(data, signature);
        if (cancelled) return;
        const stage = stageRef.current;
        if (!stage) return;
        const wrappers = pages.map((p) => {
          const wrap = document.createElement("div");
          wrap.style.cssText = "flex:0 0 auto;background:#fff;box-shadow:0 1px 10px rgba(0,0,0,0.12);overflow:hidden";
          wrap.appendChild(p);
          return wrap;
        });
        stage.replaceChildren(...wrappers);
        setPageCount(pages.length);
        applyScale();
        setReady(true);
        // Afbeeldingen (cover/logo) laden ná het mounten; daarna nog eens schalen.
        await Promise.all(pages.map(awaitNodeImages));
        if (!cancelled) applyScale();
      } catch {
        /* preview-fout mag het bewerken niet blokkeren */
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Herschaal bij zoom-wijziging en bij grootteveranderingen van het paneel.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { applyScale(); }, [zoom]);
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => applyScale());
    ro.observe(scroll);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border bg-muted/40", className)}>
      {/* Werkbalk: pagina-teller + zoom */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-card/60 px-3 py-2">
        <span className="text-[11px] font-medium text-muted-foreground">{pageCount ? `${pageCount} pagina${pageCount > 1 ? "'s" : ""}` : "Voorbeeld"}</span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Uitzoomen" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setZoom((z) => clampZoom(z - 0.25))}>
            <ZoomOut className="h-4 w-4" />
          </button>
          <button type="button" className="min-w-[3.25rem] rounded-md px-1.5 py-1 text-center text-xs font-medium tabular-nums text-foreground hover:bg-muted" onClick={() => setZoom(1)} title="Terug naar passend">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" aria-label="Inzoomen" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setZoom((z) => clampZoom(z + 0.25))}>
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scroll-area die de resterende hoogte vult */}
      <div ref={scrollRef} className="ec-scroll relative min-h-0 flex-1 overflow-auto p-4">
        {!ready && (
          <div className="absolute inset-0 z-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        <div ref={stageRef} className="mx-auto flex w-max min-w-full flex-col items-center gap-3" />
      </div>
    </div>
  );
}
