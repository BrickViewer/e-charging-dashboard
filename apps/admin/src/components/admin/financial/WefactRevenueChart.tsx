import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { formatEuro } from "@/services/calculations";
import { MONTH_LABELS_SHORT } from "@/lib/period";
import type { WefactMonthlyRow } from "@/hooks/useAdminData";

// Kleuren via design-tokens (thema-bewust). CVD-veilig door constructie: één chromatische
// (omzet=brand) + twee achromatische van verschillende lichtheid (kosten=grijs, netto=inkt).
const C_OMZET = "hsl(var(--primary))";
const C_KOSTEN = "hsl(var(--muted-foreground))";
const C_NETTO = "hsl(var(--foreground))";

const compact = (v: number) => (Math.abs(v) >= 1000 ? `€${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `€${v}`);

// Premium jaaroverzicht (Moneybird-stijl): omzet + kosten als zachte staven, netto als
// vloeiende trendlijn. Headline-cijfers boven de grafiek. Eén as (alles in euro's, excl. btw).
export function WefactRevenueChart({ rows, year }: { rows: WefactMonthlyRow[]; year: number }) {
  const data = useMemo(
    () => (rows ?? []).map((r) => ({
      m: MONTH_LABELS_SHORT[r.month - 1],
      omzet: Number(r.invoiced_excl ?? 0),
      // Kosten = self-billing-uitbetalingen + overige WeFact-inkoopfacturen.
      kosten: Number(r.cost_payout ?? 0) + Number(r.cost_purchase ?? 0),
      netto: Number(r.net_excl ?? 0),
    })),
    [rows],
  );
  const totals = useMemo(() => ({
    omzet: data.reduce((a, r) => a + r.omzet, 0),
    kosten: data.reduce((a, r) => a + r.kosten, 0),
    netto: data.reduce((a, r) => a + r.netto, 0),
  }), [data]);

  const hasData = totals.omzet !== 0 || totals.kosten !== 0;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Omzet & kosten {year}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatEuro(totals.netto)} <span className="text-sm font-normal text-muted-foreground">netto</span></p>
          </div>
          <div className="flex gap-6">
            <Headline color={C_OMZET} label="Omzet" value={totals.omzet} />
            <Headline color={C_KOSTEN} label="Kosten" value={totals.kosten} />
            <Headline color={C_NETTO} label="Netto" value={totals.netto} />
          </div>
        </div>

        {hasData ? (
          <div className="mt-5 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={4}>
                <defs>
                  <linearGradient id="wf-omzet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C_OMZET} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={C_OMZET} stopOpacity={0.65} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} dy={6} />
                <YAxis tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={compact} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 12, boxShadow: "0 4px 16px rgb(0 0 0 / 0.08)" }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, marginBottom: 4 }}
                  formatter={(v: number, name: string) => [formatEuro(v), name]}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="omzet" name="Omzet" fill="url(#wf-omzet)" radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Bar dataKey="kosten" name="Kosten" fill={C_KOSTEN} fillOpacity={0.5} radius={[4, 4, 0, 0]} maxBarSize={26} />
                <Line dataKey="netto" name="Netto" type="monotone" stroke={C_NETTO} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="mt-6 py-8 text-center text-sm text-muted-foreground">Nog geen facturatiedata in {year}.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Headline({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} /> {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{formatEuro(value)}</p>
    </div>
  );
}
