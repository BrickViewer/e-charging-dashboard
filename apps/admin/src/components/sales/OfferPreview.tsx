import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { renderOfferPages, awaitNodeImages, type OfferPdfData, type OfferSignature } from "@/services/offerPdf";
import { PAGE_W, PAGE_H } from "@/services/offerTemplate";
import { cn } from "@/lib/utils";

// Live, pixel-getrouwe preview van de offerte: rendert exact dezelfde A4-pagina-nodes
// (buildOfferPages) die ook naar de PDF worden gerasterd, geschaald naar de paneelbreedte.
// Herpagineert automatisch (paginateLetter) als bv. de levering-tekst langer/korter wordt.
export function OfferPreview({ data, signature, className }: {
  data: OfferPdfData;
  signature?: OfferSignature;
  className?: string;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // Debounce + cancellatie op een geserialiseerde key (niet op object-identiteit:
  // de parent bouwt pdfData() elke render opnieuw → anders een oneindige re-render-lus).
  const key = useMemo(() => JSON.stringify([data, signature]), [data, signature]);

  // Schaal de gemounte pagina's naar de beschikbare breedte (cap op 1 → geen upscale/blur).
  const applyScale = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const scale = Math.min(1, (stage.clientWidth || PAGE_W) / PAGE_W);
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

  // Herschaal bij grootteveranderingen van het paneel (responsive / venster-resize).
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => applyScale());
    ro.observe(pane);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={paneRef} className={cn("ec-scroll relative overflow-y-auto rounded-xl border bg-muted/40 p-3", className)}>
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      <div ref={stageRef} className="flex flex-col items-center gap-3" />
    </div>
  );
}
