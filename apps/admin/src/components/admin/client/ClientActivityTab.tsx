import { Card, CardContent } from "@/components/ui/card";
import type { AdminActivity } from "@/types/db";

export function ClientActivityTab({
  activity,
  activityLoading,
  activityError,
}: {
  activity: AdminActivity[];
  activityLoading: boolean;
  activityError: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left p-3 font-medium text-muted-foreground">Datum</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Actie</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Beschrijving</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="p-3 text-muted-foreground whitespace-nowrap">
                  {new Date(a.created_at).toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="p-3 font-medium">{a.action}</td>
                <td className="p-3 text-muted-foreground">{a.description}</td>
              </tr>
            ))}
            {activityLoading && (
              <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Activiteit laden…</td></tr>
            )}
            {activityError && (
              <tr><td colSpan={3} className="p-8 text-center text-destructive">Activiteit kon niet worden geladen.</td></tr>
            )}
            {!activityLoading && !activityError && activity.length === 0 && (
              <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">Geen activiteit</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
