import { Fragment, useState, type ReactNode } from "react";
import { ChevronRight, Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
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
  r2,
  sectionOfLine,
  sectionSellSubtotal,
  type CalcHeaderDraft,
  type CalcLineDraft,
  type CalcSection,
  type CalcTotals,
} from "@/services/calcTypes";
import { formatEuro as euro } from "@/services/calculations";

const getal = (n: number) => n.toLocaleString("nl-NL");
const uren = (n: number) => `${getal(n)} u`;

/** Met hoeveel uur de −/+ knoppen springen. Tussenwaarden typ je in het veld. */
const UUR_STAP = 1;

/** Velden in de lijst staan randloos tot je ze aanraakt — zo leest het als een
    lijst en niet als een formulier. */
const GHOST = "border-transparent bg-transparent focus-visible:border-input";
const QTY = `h-8 w-full px-1 text-right tabular-nums ${GHOST}`;
const NAME = `h-8 px-1 ${GHOST}`;
const MICRO = `h-5 w-[4.5rem] px-0.5 text-[11px] tabular-nums ${GHOST}`;
const MICRO_S = `h-5 w-8 px-0.5 text-[11px] tabular-nums ${GHOST}`;
/** Uitklap-regels zijn gewone regels, alleen ingesprongen en gedempt. */
const DETAIL_ROW = "border-b border-border/40 bg-muted/20";

export interface CalcSheetProps {
  lines: CalcLineDraft[];
  header: CalcHeaderDraft;
  totals: CalcTotals;
  frozen: boolean;
  catalog: CatalogProduct[];
  kmBusy: boolean;
  kmHint: string | null;
  onAddProduct: (p: CatalogProduct) => void;
  onAddFree: (type: "vrij" | "uren", category: CalcSection, init?: Partial<CalcLineDraft>) => void;
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

/** Uren van één urenregel; `unit_hours` is normaal 1, dus qty == uren. */
const lineHours = (l: CalcLineDraft) => lineTotals(l).hours;

/**
 * Het calculatieblad als lijst: aantal · naam · bedrag, onder elkaar, met een
 * subtiel kopje per categorie. Elke regel leest als `aantal × prijs per eenheid
 * = bedrag` — ook Uurloon (uren × uurloon) en Voorrijkosten (km × €/km × dagen).
 * Wat eronder ligt, klap je per regel open; die detailregels gebruiken hetzelfde
 * raster, zodat alles onder elkaar blijft staan.
 */
export function CalcSheet(props: CalcSheetProps) {
  const { lines, header, totals, frozen, catalog, kmBusy, kmHint, onAddProduct, onAddFree, onPatchLine, onRemoveLine, onHeaderChange, onRecomputeKm } =
    props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const { fromProductLines } = hoursSplit(lines);
  const urenLines = lines.filter((l) => sectionOfLine(l) === "arbeid");
  const materiaalSecties = CALC_SECTIONS.filter((s) => s.value !== "arbeid");

  // De −/+ op de Uurloon-regel toont het TOTAAL, maar verstelt alleen de eerste
  // urenregel (de "montage-emmer"). Zo klopt het getoonde totaal altijd, ook als
  // je de uren verderop hebt uitgesplitst of als er calculatietijd op materiaal zit.
  const emmer = urenLines[0];
  const emmerUren = emmer ? lineHours(emmer) : 0;
  const vasteUren = r2(totals.hoursTotal - emmerUren); // calculatietijd + overige urenregels

  const setTotaalUren = (totaal: number) => {
    const emmerDoel = Math.max(0, r2(totaal - vasteUren));
    if (!emmer) {
      if (emmerDoel > 0) onAddFree("uren", "arbeid", { description: "Montage", qty: emmerDoel });
      return;
    }
    if (emmerDoel <= 0) {
      onRemoveLine(emmer.uid);
      return;
    }
    const perEenheid = emmer.unit_hours > 0 ? emmer.unit_hours : 1;
    onPatchLine(emmer.uid, { qty: r2(emmerDoel / perEenheid), unit_hours: perEenheid });
  };

  /** Uren van één urenregel zetten; op nul verdwijnt de regel. */
  const setLineHours = (line: CalcLineDraft, hours: number) => {
    if (hours <= 0) {
      onRemoveLine(line.uid);
      return;
    }
    const perEenheid = line.unit_hours > 0 ? line.unit_hours : 1;
    onPatchLine(line.uid, { qty: r2(hours / perEenheid), unit_hours: perEenheid });
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {materiaalSecties.map((section) => {
        const rows = lines.filter((l) => sectionOfLine(l) === section.value);
        return (
          <section key={section.value} data-testid={`section-${section.value}`}>
            <SectionHeader id={section.value} label={section.label} caption="subtotaal" amount={euro(sectionSellSubtotal(lines, section.value))} />

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
              <p className="border-b border-border/60 px-4 py-4 text-center text-sm text-muted-foreground">Nog geen regels</p>
            )}

            {!frozen && (
              <CalcRow
                className="border-b border-border/60 py-1"
                main={
                  <div className="flex flex-wrap items-center gap-1">
                    <CatalogPickerButton products={catalogFor(catalog, section.value)} label="Artikel" onPick={onAddProduct} />
                    <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => onAddFree("vrij", section.value)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Vrije regel
                    </Button>
                  </div>
                }
              />
            )}
          </section>
        );
      })}

      {/* Arbeid & voorrijkosten: twee vaste regels in dezelfde vorm als een
          artikelregel. De urenregels waaruit het totaal is opgebouwd staan als
          ingesprongen regels achter de chevron van Uurloon. */}
      <section data-testid="section-arbeid">
        <SectionHeader id="arbeid" label="Arbeid & voorrijkosten" caption="subtotaal" amount={euro(totals.laborSell + totals.travelSell)} />

        <FixedRow
          testId="row-uurloon"
          detailId="calc-detail-uurloon"
          expanded={expanded.has("uurloon")}
          onToggle={() => toggle("uurloon")}
          qty={
            <Stepper
              value={totals.hoursTotal}
              label="uren"
              disabled={frozen}
              canDecrease={emmerUren > 0}
              onSet={setTotaalUren}
            />
          }
          label="Uurloon"
          subline={
            <>
              <span>€</span>
              <NumField className={MICRO} decimals={2} value={header.hourly_rate} disabled={frozen} onCommit={(n) => onHeaderChange({ hourly_rate: n })} />
              <span className="whitespace-nowrap">per uur</span>
            </>
          }
          amount={euro(totals.laborSell)}
        />

        {expanded.has("uurloon") && (
          <div id="calc-detail-uurloon">
            {urenLines.map((line) => (
              <CalcRow
                key={line.uid}
                testId={`row-${line.uid}`}
                className={DETAIL_ROW}
                qty={<Stepper value={lineHours(line)} label="uren" disabled={frozen} canDecrease onSet={(h) => setLineHours(line, h)} />}
                main={
                  <Input
                    className={cn("h-8 text-sm", NAME)}
                    value={line.description}
                    placeholder="Omschrijving werkzaamheden…"
                    disabled={frozen}
                    onChange={(e) => onPatchLine(line.uid, { description: e.target.value })}
                  />
                }
                amount={<span className="text-sm text-muted-foreground">{uren(lineHours(line))}</span>}
                action={
                  !frozen && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Regel verwijderen"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveLine(line.uid)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )
                }
              />
            ))}

            {/* Deze uren zitten op materiaalregels (een meterkast draagt er 8) en
                tellen mee in het montagebedrag — daarom hier zichtbaar. */}
            {fromProductLines > 0 && (
              <CalcRow
                className={DETAIL_ROW}
                main={<span className="flex h-8 items-center truncate px-1 text-sm text-muted-foreground">Calculatietijd uit materiaalregels</span>}
                amount={<span className="text-sm text-muted-foreground">{uren(fromProductLines)}</span>}
              />
            )}

            {!frozen && (
              <CalcRow
                className={cn(DETAIL_ROW, "py-1")}
                main={
                  <div className="flex flex-wrap items-center gap-1">
                    <CatalogPickerButton products={catalogFor(catalog, "arbeid")} label="Arbeidsregel" onPick={onAddProduct} />
                    <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => onAddFree("uren", "arbeid")}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Urenregel
                    </Button>
                  </div>
                }
              />
            )}
          </div>
        )}

        <FixedRow
          testId="row-voorrijkosten"
          detailId="calc-detail-voorrijkosten"
          expanded={expanded.has("voorrijkosten")}
          onToggle={() => toggle("voorrijkosten")}
          qty={<NumField className={QTY} value={header.retour_km} disabled={frozen} onCommit={(n) => onHeaderChange({ retour_km: n })} />}
          label="Voorrijkosten"
          subline={
            <>
              <span>€</span>
              <NumField className={MICRO} decimals={2} value={header.km_price} disabled={frozen} onCommit={(n) => onHeaderChange({ km_price: n })} />
              <span className="whitespace-nowrap">per km ×</span>
              <NumField className={MICRO_S} value={header.travel_days} disabled={frozen} onCommit={(n) => onHeaderChange({ travel_days: n })} />
              <span className="whitespace-nowrap">dag(en)</span>
            </>
          }
          amount={euro(totals.travelSell)}
        />

        {expanded.has("voorrijkosten") && (
          <CalcRow
            testId="detail-voorrijkosten"
            className={cn(DETAIL_ROW, "py-1")}
            main={
              <div id="calc-detail-voorrijkosten" className="space-y-1 py-1">
                <p className="px-1 text-[11px] text-muted-foreground">
                  Retour-afstand tussen kantoor en projectlocatie{kmHint ? ` — ${kmHint.replace(/^Berekend: /, "")}` : ""}.
                </p>
                {!frozen && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={kmBusy} onClick={onRecomputeKm}>
                    <RefreshCw className={cn("mr-1.5 h-3 w-3", kmBusy && "animate-spin")} /> Afstand opnieuw berekenen
                  </Button>
                )}
              </div>
            }
          />
        )}
      </section>

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
        <p className="px-3 pb-3 pl-[7rem] text-[11px] text-muted-foreground">
          Staat als aparte post op de offerte — telt niet mee in de offerteprijs.
        </p>
      </section>
    </div>
  );
}

/** −/+ rond een bewerkbaar getal. Grote knoppen, want dit is de handeling die
    je tijdens het calculeren het vaakst doet. */
function Stepper({
  value,
  label,
  disabled,
  canDecrease,
  onSet,
}: {
  value: number;
  label: string;
  disabled?: boolean;
  canDecrease: boolean;
  onSet: (n: number) => void;
}) {
  return (
    <div className="flex h-8 w-full items-center">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        aria-label={`Minder ${label}`}
        disabled={disabled || !canDecrease}
        onClick={() => onSet(r2(value - UUR_STAP))}
      >
        <Minus className="h-3 w-3" />
      </Button>
      <NumField
        className={cn("h-6 min-w-0 flex-1 px-0 text-center text-sm tabular-nums", GHOST)}
        value={value}
        disabled={disabled}
        onCommit={onSet}
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-5 shrink-0 p-0 text-muted-foreground hover:text-foreground"
        aria-label={`Meer ${label}`}
        disabled={disabled}
        onClick={() => onSet(r2(value + UUR_STAP))}
      >
        <Plus className="h-3 w-3" />
      </Button>
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

function ChevronToggle({ expanded, onToggle, controls }: { expanded: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={expanded ? "Details verbergen" : "Details tonen"}
      className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
    </button>
  );
}

/** Vaste regel (Uurloon, Voorrijkosten): geen catalogusartikel, maar wel exact
    dezelfde vorm — aantal · naam · subregel met prijs per eenheid · bedrag. */
function FixedRow({
  testId,
  detailId,
  expanded,
  onToggle,
  qty,
  label,
  subline,
  amount,
}: {
  testId: string;
  detailId: string;
  expanded: boolean;
  onToggle: () => void;
  qty: ReactNode;
  label: string;
  subline: ReactNode;
  amount: string;
}) {
  return (
    <CalcRow
      testId={testId}
      className="border-b border-border/60 transition-colors hover:bg-muted/30"
      chevron={<ChevronToggle expanded={expanded} onToggle={onToggle} controls={detailId} />}
      qty={qty}
      main={
        <>
          <div className="flex h-8 items-center px-1 text-sm">{label}</div>
          <div className="flex min-w-0 items-center gap-1 px-1 text-[11px] text-muted-foreground">{subline}</div>
        </>
      }
      amount={<span className="text-sm">{amount}</span>}
    />
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
  const detailId = `calc-detail-${line.uid}`;

  return (
    <Fragment>
      <CalcRow
        testId={`row-${line.uid}`}
        className="group border-b border-border/60 transition-colors hover:bg-muted/30"
        chevron={<ChevronToggle expanded={expanded} onToggle={onToggle} controls={detailId} />}
        qty={<NumField className={QTY} value={line.qty} disabled={frozen} onCommit={(n) => onPatch({ qty: n })} />}
        main={
          <>
            <Input
              className={NAME}
              value={line.description}
              title={line.description || undefined}
              placeholder="Omschrijving…"
              disabled={frozen}
              onChange={(e) => onPatch({ description: e.target.value })}
            />
            <div className="flex min-w-0 items-center gap-1 px-1 text-[11px] text-muted-foreground">
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
            </div>
          </>
        }
        amount={<span className="text-sm">{euro(t.sell)}</span>}
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

      {expanded && (
        <div id={detailId}>
          <DetailRow label={`Inkoop per ${line.unit}`}>
            <NumField
              className="h-7 w-full px-1 text-right text-xs tabular-nums"
              decimals={2}
              value={line.unit_cost}
              disabled={frozen}
              onCommit={(n) => onPatch({ unit_cost: n })}
            />
          </DetailRow>
          <DetailRow label={`Montagetijd per ${line.unit}`}>
            <NumField
              className="h-7 w-full px-1 text-right text-xs tabular-nums"
              value={line.unit_hours}
              disabled={frozen}
              onCommit={(n) => onPatch({ unit_hours: n })}
            />
          </DetailRow>
        </div>
      )}
    </Fragment>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <CalcRow
      className={DETAIL_ROW}
      main={<span className="flex h-8 items-center truncate px-1 text-xs text-muted-foreground">{label}</span>}
      amount={children}
    />
  );
}
