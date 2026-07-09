import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumField } from "./NumField";
import { CatalogPickerButton } from "./CatalogPickerButton";
import type { CatalogProduct } from "@/hooks/useCatalogProducts";
import {
  CALC_SECTIONS,
  hoursSplit,
  lineTotals,
  sectionOfLine,
  sectionSellSubtotal,
  type CalcHeaderDraft,
  type CalcLineDraft,
  type CalcSection,
  type CalcTotals,
} from "@/services/calcTypes";
import { formatEuro as euro } from "@/services/calculations";

const uren = (n: number) => `${n.toLocaleString("nl-NL")} u`;

/** Regelvelden staan randloos in het blad en krijgen pas een kader bij focus —
    zo leest de tabel als een calculatieblad en niet als een formulier. */
const CELL = "h-8 border-transparent bg-transparent px-1 text-right tabular-nums focus-visible:border-input";

export interface CalcSheetProps {
  lines: CalcLineDraft[];
  header: CalcHeaderDraft;
  totals: CalcTotals;
  frozen: boolean;
  catalog: CatalogProduct[];
  kmBusy: boolean;
  kmHint: string | null;
  onAddProduct: (p: CatalogProduct) => void;
  onAddFree: (type: "vrij" | "uren", category: CalcSection) => void;
  onPatchLine: (index: number, patch: Partial<CalcLineDraft>) => void;
  onRemoveLine: (index: number) => void;
  onHeaderChange: (patch: Partial<CalcHeaderDraft>) => void;
  onRecomputeKm: () => void;
}

/** Artikelen die onder een sectie gekozen mogen worden. Arbeid gaat op `kind`,
    niet op categorie — zo belandt een arbeidsartikel nooit tussen het materiaal. */
function catalogFor(catalog: CatalogProduct[], section: CalcSection): CatalogProduct[] {
  if (section === "arbeid") return catalog.filter((p) => p.kind === "arbeid");
  if (section === "laadpalen") return catalog.filter((p) => p.kind !== "arbeid" && p.category === "laadpalen");
  return catalog.filter((p) => p.kind !== "arbeid" && (p.category === "installatiemateriaal" || p.category === "overig"));
}

/**
 * Het calculatieblad: één doorlopende tabel met een kop per categorie, waaronder
 * je regels onder elkaar toevoegt. De rekenparameters (uurloon, voorrijkosten,
 * stelpost) staan als rijen op hun eigen plek in de rekenvolgorde.
 */
export function CalcSheet(props: CalcSheetProps) {
  const { lines, header, totals, frozen, catalog, kmBusy, kmHint, onAddProduct, onAddFree, onPatchLine, onRemoveLine, onHeaderChange, onRecomputeKm } =
    props;

  // De globale index vastleggen vóór het filteren: patchLine/removeLine werken
  // op de volledige array, dus een filter-index zou de verkeerde regel raken.
  const rowsOf = (section: CalcSection) =>
    lines.map((line, index) => ({ line, index })).filter((r) => sectionOfLine(r.line) === section);

  const { fromProductLines } = hoursSplit(lines);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 font-medium">Omschrijving</th>
              <th className="w-20 px-2 py-2.5 text-right font-medium">Aantal</th>
              <th className="w-24 px-2 py-2.5 text-right font-medium">Inkoop/eenh.</th>
              <th className="w-24 px-2 py-2.5 text-right font-medium">Verkoop/eenh.</th>
              <th className="w-20 px-2 py-2.5 text-right font-medium">Uur/eenh.</th>
              <th className="w-28 px-2 py-2.5 text-right font-medium">Totaal</th>
              <th className="w-10 px-2 py-2.5" />
            </tr>
          </thead>

          {CALC_SECTIONS.map((section) => {
            const rows = rowsOf(section.value);
            const isArbeid = section.value === "arbeid";
            const sectionTotal = isArbeid ? totals.laborSell + totals.travelSell : sectionSellSubtotal(lines, section.value);
            const products = catalogFor(catalog, section.value);

            return (
              <tbody key={section.value} className="border-b last:border-0">
                <SectionHeader label={section.label} value={euro(sectionTotal)} caption="subtotaal" />

                {isArbeid && (
                  <tr className="border-b">
                    <td colSpan={4} className="px-3 py-2 text-muted-foreground">
                      Uurloon
                    </td>
                    <td colSpan={2} className="px-2 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <NumField
                          className="h-8 w-24 text-right tabular-nums"
                          value={header.hourly_rate}
                          disabled={frozen}
                          onCommit={(n) => onHeaderChange({ hourly_rate: n })}
                        />
                        <span className="text-xs text-muted-foreground">€/uur</span>
                      </div>
                    </td>
                    <td />
                  </tr>
                )}

                {rows.map(({ line, index }) => (
                  <LineRow
                    key={line.id ?? `nieuw-${index}`}
                    line={line}
                    frozen={frozen}
                    onPatch={(patch) => onPatchLine(index, patch)}
                    onRemove={() => onRemoveLine(index)}
                  />
                ))}

                {rows.length === 0 && (
                  <tr className="border-b">
                    <td colSpan={7} className="px-4 py-5 text-center text-sm text-muted-foreground">
                      {isArbeid ? "Nog geen arbeidsregels" : "Nog geen regels"}
                    </td>
                  </tr>
                )}

                {!frozen && (
                  <tr className="border-b">
                    <td colSpan={7} className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CatalogPickerButton
                          products={products}
                          label={isArbeid ? "Arbeidsregel uit catalogus" : "Artikel uit catalogus"}
                          onPick={onAddProduct}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-muted-foreground"
                          onClick={() => onAddFree(isArbeid ? "uren" : "vrij", section.value)}
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> {isArbeid ? "Urenregel" : "Vrije regel"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}

                {isArbeid && (
                  <>
                    {fromProductLines > 0 && (
                      <tr className="border-b text-muted-foreground">
                        <td colSpan={5} className="px-3 py-2">
                          Calculatietijd uit materiaalregels
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{uren(fromProductLines)}</td>
                        <td />
                      </tr>
                    )}
                    <tr className="border-b">
                      <td colSpan={5} className="px-3 py-2">
                        Montage — {uren(totals.hoursTotal)} × {euro(header.hourly_rate)}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">{euro(totals.laborSell)}</td>
                      <td />
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>Voorrijkosten</span>
                          <NumField
                            className="h-8 w-20 text-right tabular-nums"
                            value={header.retour_km}
                            disabled={frozen}
                            onCommit={(n) => onHeaderChange({ retour_km: n })}
                          />
                          <span className="text-xs text-muted-foreground">km ×</span>
                          <NumField
                            className="h-8 w-20 text-right tabular-nums"
                            value={header.km_price}
                            disabled={frozen}
                            onCommit={(n) => onHeaderChange({ km_price: n })}
                          />
                          <span className="text-xs text-muted-foreground">€/km ×</span>
                          <NumField
                            className="h-8 w-16 text-right tabular-nums"
                            value={header.travel_days}
                            disabled={frozen}
                            onCommit={(n) => onHeaderChange({ travel_days: n })}
                          />
                          <span className="text-xs text-muted-foreground">dag(en)</span>
                          {!frozen && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5"
                              title="Afstand kantoor ↔ projectlocatie opnieuw berekenen"
                              disabled={kmBusy}
                              onClick={onRecomputeKm}
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${kmBusy ? "animate-spin" : ""}`} />
                            </Button>
                          )}
                        </div>
                        {kmHint && <p className="mt-1 text-[11px] text-muted-foreground">{kmHint}</p>}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">{euro(totals.travelSell)}</td>
                      <td />
                    </tr>
                  </>
                )}
              </tbody>
            );
          })}

          <tbody>
            <SectionHeader label="Stelpost graafwerk" value={euro(totals.stelpost)} caption="apart op de offerte" />
            <tr>
              <td colSpan={7} className="px-3 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Bedrag</span>
                    <NumField
                      className="h-8 w-28 text-right tabular-nums"
                      value={header.stelpost_graafwerk}
                      disabled={frozen}
                      onCommit={(n) => onHeaderChange({ stelpost_graafwerk: n })}
                    />
                  </div>
                  <div className="flex min-w-[16rem] flex-1 items-center gap-2">
                    <span className="text-xs text-muted-foreground">Notitie</span>
                    <Input
                      className="h-8"
                      value={header.stelpost_note}
                      disabled={frozen}
                      placeholder="€115 p/u, koppeluren, Slegh Infra…"
                      onChange={(e) => onHeaderChange({ stelpost_note: e.target.value })}
                    />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Staat als aparte post op de offerte — telt niet mee in de offerteprijs.
                </p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionHeader({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <tr className="border-y bg-muted/40">
      <td colSpan={5} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide">
        {label}
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <span className="text-xs font-medium">{value}</span>
      </td>
      <td className="px-2 py-2 text-right">
        {caption && <span className="whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground">{caption}</span>}
      </td>
    </tr>
  );
}

function LineRow({
  line,
  frozen,
  onPatch,
  onRemove,
}: {
  line: CalcLineDraft;
  frozen: boolean;
  onPatch: (patch: Partial<CalcLineDraft>) => void;
  onRemove: () => void;
}) {
  const t = lineTotals(line);
  const isUren = line.line_type === "uren";
  return (
    <tr className="border-b align-middle">
      <td className="px-3 py-1.5">
        <Input
          className="h-8 border-transparent bg-transparent px-1 focus-visible:border-input"
          value={line.description}
          placeholder={isUren ? "Omschrijving werkzaamheden…" : "Omschrijving…"}
          disabled={frozen}
          onChange={(e) => onPatch({ description: e.target.value })}
        />
        <div className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          {[line.supplier, line.order_number, `per ${line.unit}`].filter(Boolean).join(" · ")}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <NumField className={CELL} value={line.qty} disabled={frozen} onCommit={(n) => onPatch({ qty: n })} />
      </td>
      <td className="px-2 py-1.5">
        {!isUren && <NumField className={CELL} value={line.unit_cost} disabled={frozen} onCommit={(n) => onPatch({ unit_cost: n })} />}
      </td>
      <td className="px-2 py-1.5">
        {!isUren && <NumField className={CELL} value={line.unit_sell} disabled={frozen} onCommit={(n) => onPatch({ unit_sell: n })} />}
      </td>
      <td className="px-2 py-1.5">
        {/* Materiaal zonder calculatietijd zou anders een kolom nullen opleveren. */}
        <NumField
          className={`${CELL} ${line.unit_hours === 0 ? "text-muted-foreground/50" : ""}`}
          value={line.unit_hours}
          disabled={frozen}
          onCommit={(n) => onPatch({ unit_hours: n })}
        />
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{isUren ? uren(t.hours) : euro(t.sell)}</td>
      <td className="px-2 py-1.5 text-right">
        {!frozen && (
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );
}
