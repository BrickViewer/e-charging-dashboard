// Doelenbeheer van het directie-werkblad: per KPI een jaardoel en/of
// maanddoelen per kalenderjaar (kpi_targets, admin-only). Semantiek:
// maanddoel wint van jaardoel/12; jaardoel wint van som-van-maanddoelen
// (zie services/kpiTargets.ts).
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useKpiTargets, useSaveKpiTargets } from "@/hooks/useKpiTargets";
import { KPI_METRICS, type KpiMetric } from "@/services/kpiTargets";

const MONTH_LABELS = ["Jan", "Feb", "Mrt", "Apr", "Mei", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

type Draft = { yearTarget: string; monthTargets: string[] };

const parseNum = (s: string): number | null => {
  const v = s.replace(",", ".").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function MetricCard({ metric, year, rows, onSaved }: {
  metric: (typeof KPI_METRICS)[number];
  year: number;
  rows: { metric: string; month: number | null; target_value: number }[];
  onSaved: () => void;
}) {
  const save = useSaveKpiTargets();
  const seed = useMemo<Draft>(() => {
    const mine = rows.filter((r) => r.metric === metric.key);
    return {
      yearTarget: String(mine.find((r) => r.month === null)?.target_value ?? "") || "",
      monthTargets: Array.from({ length: 12 }, (_, i) => {
        const row = mine.find((r) => r.month === i + 1);
        return row ? String(row.target_value) : "";
      }),
    };
  }, [rows, metric.key]);

  const [draft, setDraft] = useState<Draft>(seed);
  useEffect(() => setDraft(seed), [seed]);

  const dirty = draft.yearTarget !== seed.yearTarget || draft.monthTargets.some((v, i) => v !== seed.monthTargets[i]);

  const doSave = async () => {
    try {
      await save.mutateAsync({
        metric: metric.key as KpiMetric,
        year,
        yearTarget: parseNum(draft.yearTarget),
        monthTargets: draft.monthTargets.map(parseNum),
      });
      toast.success(`Doelen voor ${metric.label} opgeslagen`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  const unitHint = metric.unit === "eur" ? "in €" : metric.unit === "kwh" ? "in kWh" : "aantal";

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{metric.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Jaardoel of maanddoelen ({unitHint}); maanddoel wint van jaardoel ÷ 12.</p>
          </div>
          <Button size="sm" onClick={doSave} disabled={!dirty || save.isPending}>
            {save.isPending ? "Opslaan…" : "Opslaan"}
          </Button>
        </div>
        <div className="max-w-[240px]">
          <Label className="text-xs text-muted-foreground">Jaardoel {year}</Label>
          <Input className="mt-1 h-9" inputMode="decimal" placeholder="—" value={draft.yearTarget}
            onChange={(e) => setDraft((d) => ({ ...d, yearTarget: e.target.value }))} />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {MONTH_LABELS.map((m, i) => (
            <div key={m}>
              <Label className="text-xs text-muted-foreground">{m}</Label>
              <Input className="mt-1 h-9" inputMode="decimal" placeholder="—" value={draft.monthTargets[i]}
                onChange={(e) => setDraft((d) => {
                  const next = [...d.monthTargets];
                  next[i] = e.target.value;
                  return { ...d, monthTargets: next };
                })} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DirectieDoelen() {
  const curYear = new Date().getFullYear();
  const [year, setYear] = useState(curYear);
  const targetsQ = useKpiTargets(year);
  const years = [curYear - 1, curYear, curYear + 1, curYear + 2];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Doelen</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Stel doelen per KPI en volg de voortgang op het dashboard</p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {targetsQ.isLoading ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
      ) : (
        <div className="space-y-4">
          {KPI_METRICS.map((m) => (
            <MetricCard key={`${m.key}-${year}`} metric={m} year={year} rows={targetsQ.data ?? []} onSaved={() => targetsQ.refetch()} />
          ))}
        </div>
      )}
    </div>
  );
}
