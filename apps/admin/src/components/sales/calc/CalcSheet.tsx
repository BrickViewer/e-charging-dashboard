import { useState } from "react";
import { ChevronRight, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NumField } from "./NumField";
import { CalcRow, ROW_GRID } from "./CalcRow";
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

/** Velden in de lijst staan randloos tot je ze aanraakt — zo leest het als een
    lijst en niet als een formulier. */
const GHOST = "border-transparent bg-transparent focus-visible:border-input";
const QTY = `h-8 w-full px-1 text-right tabular-nums ${GHOST}`;
const NAME = `h-8 px-1 ${GHOST}`;
const MICRO = `h-5 w-[4.5rem] px-0.5 text-[11px] tabular-nums ${GHOST}`;
const PARAM = "h-7 w-16 px-1 text-right text-sm tabular-nums";

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
  onPatchLine: (uid: string, patch: Partial<CalcLineDraft>) => void;
  onRemoveLine: (uid: string) => void;
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
 * Het calculatieblad als lijst: aantal · naam · bedrag, onder elkaar, met een
 * subtiel kopje per categorie. De interne cijfers (inkoop, montagetijd) zitten
 * achter een chevron per regel; de verkoopprijs blijft op de subregel staan,
 * want daarmee maak je een pas toegevoegde vrije regel bruikbaar.
 */
export function CalcSheet(props: CalcSheetProps) {
  const { lines, header, totals, frozen, catalog, kmBusy, kmHint, onAddProduct, onAddFree, onPatchLine, onRemoveLine, onHeaderChange, onRecomputeKm } =
    props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (uid: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(uid)) next.add(uid);
      return next;
    });

  const { fromProductLines } = hoursSplit(lines);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {CALC_SECTIONS.map((section) => {
        const rows = lines.filter((l) => sectionOfLine(l) === section.value);
        const isArbeid = section.value === "arbeid";
        const subtotal = isArbeid ? totals.laborSell + totals.travelSell : sectionSellSubtotal(lines, section.value);

        return (
          <section key={section.value} data-testid={`section-${section.value}`}>
            <SectionHeader id={section.value} label={section.label} caption="subtotaal" amount={euro(subtotal)} />

            {rows.map((line) => (
              <LineRow
                key={line.uid}
                line={line}
                frozen={frozen}
                expanded={expanded.has(line.uid)}
                onToggle={() => toggle(line.uid)}
                onPatch={(patch) => onPatchLine(line.uid, patch)}
                onRemove={() => onRemoveLine(line.uid)}
              />
            ))}

            {rows.length === 0 && (
              <p className="border-b border-border/60 px-4 py-4 text-center text-sm text-muted-foreground">
                {isArbeid ? "Nog geen arbeidsregels" : "Nog geen regels"}
              </p>
            )}

            {!frozen && (
              <CalcRow
                className="border-b border-border/60 py-1"
                main={
                  <div className="flex flex-wrap items-center gap-1">
                    <CatalogPickerButton
                      products={catalogFor(catalog, section.value)}
                      label={isArbeid ? "Arbeidsregel" : "Artikel"}
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
                }
              />
            )}

            {isArbeid && (
              <>
                {fromProductLines > 0 && (
                  <CalcRow
                    className="border-b border-border/60 text-muted-foreground"
                    main={<span className="text-sm leading-8">Calculatietijd uit materiaalregels</span>}
                    amount={<span className="text-sm">{uren(fromProductLines)}</span>}
                  />
                )}
                <CalcRow
                  className="border-b border-border/60"
                  main={
                    <div className="flex h-8 flex-wrap items-center gap-1.5 text-sm">
                      <span>Uurloon</span>
                      <NumField
                        className={PARAM}
                        decimals={2}
                        value={header.hourly_rate}
                        disabled={frozen}
                        onCommit={(n) => onHeaderChange({ hourly_rate: n })}
                      />
                      <span className="text-muted-foreground">€/uur × {uren(totals.hoursTotal)}</span>
                    </div>
                  }
                  amount={<span className="font-medium">{euro(totals.laborSell)}</span>}
                />
                <CalcRow
                  className="border-b border-border/60"
                  main={
                    <div>
                      <div className="flex h-8 flex-wrap items-center gap-1.5 text-sm">
                        <span>Voorrijkosten</span>
                        <NumField className={PARAM} value={header.retour_km} disabled={frozen} onCommit={(n) => onHeaderChange({ retour_km: n })} />
                        <span className="text-muted-foreground">km ×</span>
                        <NumField className={PARAM} value={header.km_price} disabled={frozen} onCommit={(n) => onHeaderChange({ km_price: n })} />
                        <span className="text-muted-foreground">€/km ×</span>
                        <NumField className={PARAM} value={header.travel_days} disabled={frozen} onCommit={(n) => onHeaderChange({ travel_days: n })} />
                        <span className="text-muted-foreground">dag(en)</span>
                        {!frozen && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground"
                            aria-label="Afstand kantoor ↔ projectlocatie opnieuw berekenen"
                            disabled={kmBusy}
                            onClick={onRecomputeKm}
                          >
                            <RefreshCw className={cn("h-3.5 w-3.5", kmBusy && "animate-spin")} />
                          </Button>
                        )}
                      </div>
                      {kmHint && <p className="px-1 pb-1 text-[11px] text-muted-foreground">{kmHint}</p>}
                    </div>
                  }
                  amount={<span className="font-medium">{euro(totals.travelSell)}</span>}
                />
              </>
            )}
          </section>
        );
      })}

      <section data-testid="section-stelpost">
        <SectionHeader id="stelpost" label="Stelpost graafwerk" caption="apart op de offerte" />
        <CalcRow
          main={
            <Input
              className={cn("h-8", GHOST)}
              value={header.stelpost_note}
              disabled={frozen}
              placeholder="Notitie — bv. €115 p/u, koppeluren, Slegh Infra"
              onChange={(e) => onHeaderChange({ stelpost_note: e.target.value })}
            />
          }
          amount={
            <NumField
              className="h-8 w-full px-1 text-right font-medium tabular-nums"
              decimals={2}
              value={header.stelpost_graafwerk}
              disabled={frozen}
              onCommit={(n) => onHeaderChange({ stelpost_graafwerk: n })}
            />
          }
        />
        <p className="px-3 pb-3 pl-[5.25rem] text-[11px] text-muted-foreground">
          Staat als aparte post op de offerte — telt niet mee in de offerteprijs.
        </p>
      </section>
    </div>
  );
}

function SectionHeader({ id, label, caption, amount }: { id: string; label: string; caption: string; amount?: string }) {
  return (
    <div className={cn(ROW_GRID, "items-center border-b bg-muted/40 py-2")}>
      <div className="col-span-3 flex min-w-0 items-baseline justify-between gap-3">
        <span className="cockpit-section-label truncate" title={label}>
          {label}
        </span>
        {/* Het kopje heeft veel letterafstand; op smalle schermen botst het
            bijschrift anders op het bedrag. */}
        <span className="hidden whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground sm:inline">{caption}</span>
      </div>
      <div className="text-right text-xs font-medium tabular-nums" data-testid={`subtotal-${id}`}>
        {amount}
      </div>
      <div />
    </div>
  );
}

function LineRow({
  line,
  frozen,
  expanded,
  onToggle,
  onPatch,
  onRemove,
}: {
  line: CalcLineDraft;
  frozen: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<CalcLineDraft>) => void;
  onRemove: () => void;
}) {
  const t = lineTotals(line);
  const isUren = line.line_type === "uren";
  const detailId = `calc-detail-${line.uid}`;

  return (
    <CalcRow
      testId={`row-${line.uid}`}
      className="group border-b border-border/60 transition-colors hover:bg-muted/30"
      chevron={
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-label={expanded ? "Details verbergen" : "Details tonen"}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
      }
      qty={<NumField className={QTY} value={line.qty} disabled={frozen} onCommit={(n) => onPatch({ qty: n })} />}
      main={
        <>
          <Input
            className={NAME}
            value={line.description}
            title={line.description || undefined}
            placeholder={isUren ? "Omschrijving werkzaamheden…" : "Omschrijving…"}
            disabled={frozen}
            onChange={(e) => onPatch({ description: e.target.value })}
          />
          <div className="flex min-w-0 items-center gap-1 px-1 text-[11px] text-muted-foreground">
            {isUren ? (
              <span>per uur</span>
            ) : (
              <>
                <span>€</span>
                <NumField className={MICRO} decimals={2} value={line.unit_sell} disabled={frozen} onCommit={(n) => onPatch({ unit_sell: n })} />
                <span className="whitespace-nowrap">per {line.unit}</span>
                {/* De montagetijd zit in het montagebedrag, niet in dit regelbedrag.
                    Zonder deze hint verdwijnt hij ongezien achter de chevron. */}
                {line.unit_hours > 0 && (
                  <span className="truncate" title={`${uren(line.unit_hours)} montagetijd per ${line.unit}`}>
                    · {uren(line.unit_hours)} montagetijd per {line.unit}
                  </span>
                )}
              </>
            )}
          </div>

          {expanded && (
            <div id={detailId} className="mb-1 mt-1 space-y-1 rounded-md bg-muted/50 px-2 py-1.5">
              {!isUren && (
                <DetailField
                  label={`Inkoop per ${line.unit}`}
                  value={line.unit_cost}
                  decimals={2}
                  disabled={frozen}
                  onCommit={(n) => onPatch({ unit_cost: n })}
                />
              )}
              <DetailField
                label={isUren ? "Uren per eenheid" : `Montagetijd per ${line.unit}`}
                value={line.unit_hours}
                disabled={frozen}
                onCommit={(n) => onPatch({ unit_hours: n })}
              />
            </div>
          )}
        </>
      }
      amount={
        isUren ? <span className="text-sm text-muted-foreground">{uren(t.hours)}</span> : <span className="text-sm">{euro(t.sell)}</span>
      }
      action={
        !frozen && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Regel verwijderen"
            className="h-7 w-7 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )
      }
    />
  );
}

function DetailField({
  label,
  value,
  disabled,
  decimals,
  onCommit,
}: {
  label: string;
  value: number;
  disabled: boolean;
  decimals?: number;
  onCommit: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <NumField
        className="h-7 w-24 px-1 text-right text-xs tabular-nums"
        value={value}
        decimals={decimals}
        disabled={disabled}
        onCommit={onCommit}
      />
    </div>
  );
}
