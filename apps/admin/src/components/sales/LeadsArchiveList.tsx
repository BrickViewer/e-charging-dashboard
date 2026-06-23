import { Card, CardContent } from "@/components/ui/card";
import { Archive } from "lucide-react";
import type { LeadWithTasks } from "@/hooks/useLeads";

const euro = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// Archief: afgehandelde leads (gewonnen + verloren) als doorzoekbare lijst.
export function LeadsArchiveList({
  leads,
  ownerName,
  onRowClick,
}: {
  leads: LeadWithTasks[];
  ownerName: (id: string | null) => string | null;
  onRowClick: (l: LeadWithTasks) => void;
}) {
  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <Archive className="h-7 w-7 text-muted-foreground/60" />
          Nog geen afgehandelde leads in het archief.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                <th className="p-3 font-medium">Bedrijf</th>
                <th className="p-3 font-medium">Contact</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 text-right font-medium">Waarde</th>
                <th className="p-3 font-medium">Afgehandeld</th>
                <th className="p-3 font-medium">Eigenaar</th>
                <th className="p-3 font-medium">Reden (verloren)</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const won = l.status === "won";
                return (
                  <tr
                    key={l.id}
                    className="cursor-pointer border-b last:border-0 transition-colors hover:bg-accent/40"
                    onClick={() => onRowClick(l)}
                  >
                    <td className="p-3 font-medium text-foreground">{l.company_name || "—"}</td>
                    <td className="p-3 text-muted-foreground">{l.contact_name || "—"}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${won ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        {won ? "Gewonnen" : "Verloren"}
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums">{l.estimated_value != null ? euro(l.estimated_value) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{fmtDate(won ? l.won_at : l.lost_at)}</td>
                    <td className="p-3 text-muted-foreground">{ownerName(l.owner_user_id) || "—"}</td>
                    <td className="p-3 text-muted-foreground">{won ? "—" : l.lost_reason || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
