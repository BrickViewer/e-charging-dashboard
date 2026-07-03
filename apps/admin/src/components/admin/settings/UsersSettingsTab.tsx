import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useTeamMembers, useUserRoles, useAccessRequests } from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus, Loader2, Trash2, ShieldCheck } from "lucide-react";
import type { Profile } from "@/types/db";

export function UsersSettingsTab() {
  const queryClient = useQueryClient();
  const { user, isSuperadmin, role } = useAuth();

  const [requestRoles, setRequestRoles] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);

  // Deze reads (profielen, rollen, toegangsverzoeken) zijn admin/superadmin-only.
  // Voor manager/viewer blokkeert RLS ze toch; draai ze dan niet eens (geen ruis/errors).
  const canReadAdmin = role === "admin" || isSuperadmin;

  const { data: profiles, isLoading: profilesLoading } = useTeamMembers(canReadAdmin);
  const { data: userRoles, isLoading: userRolesLoading } = useUserRoles(canReadAdmin);
  // Openstaande toegangsverzoeken (e-groupers die inlogden maar nog geen rol hebben).
  const { data: pendingRequests } = useAccessRequests(canReadAdmin);

  // Alleen échte interne gebruikers tonen: profielen mét een interne rol.
  // De profielentabel bevat ook portal-klanten en ex-admins zonder rol — die horen
  // hier niet thuis (en mogen niet als 'teamlid' verschijnen).
  const internalProfiles = ((profiles ?? []) as Profile[]).filter(
    (p) => (userRoles ?? []).some((r) => r.user_id === p.user_id),
  );

  const getRoleForUser = (userId: string) => {
    const roles = (userRoles ?? []).filter(r => r.user_id === userId).map(r => r.role);
    if (roles.includes("superadmin")) return "superadmin"; // superadmin wint van admin
    return roles[0] || "—";
  };
  const isSuperadminUser = (userId: string) =>
    (userRoles ?? []).some(r => r.user_id === userId && r.role === "superadmin");
  // Alleen de superadmin mag verwijderen; nooit zichzelf en nooit een (andere) superadmin.
  const canDeleteUser = (userId: string) =>
    isSuperadmin && userId !== user?.id && !isSuperadminUser(userId);

  // Welke rollen mag de huidige gebruiker toekennen? Admin/manager alleen de superadmin.
  const assignableRoles: Array<[string, string]> = isSuperadmin
    ? [["admin", "Admin"], ["manager", "Manager"], ["sales", "Sales"], ["marketing", "Marketing"], ["viewer", "Viewer"]]
    : [["sales", "Sales"], ["marketing", "Marketing"], ["viewer", "Viewer"]];
  // admin of superadmin mag verzoeken afhandelen (role is 'admin' voor beide).
  const canHandleRequests = role === "admin";

  // Toegangsverzoek goedkeuren (rol toekennen) of weigeren via de edge-functie.
  const decisionMutation = useMutation({
    mutationFn: async (vars: { requestId: string; action: "approve" | "deny"; role?: string }) => {
      const { data, error } = await supabase.functions.invoke("assign-user-role", {
        body: { request_id: vars.requestId, action: vars.action, role: vars.role },
      });
      if (error) {
        let msg = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.message) msg = body.message;
        } catch { /* body niet leesbaar — val terug op generieke melding */ }
        throw new Error(msg);
      }
      const res = data as { status?: string; message?: string };
      if (res?.status !== "approved" && res?.status !== "denied") throw new Error(res?.message || "Mislukt");
      return res;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["admin-access-requests"] });
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      toast.success(res?.status === "approved" ? "Rol toegekend" : "Verzoek geweigerd");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Mislukt"),
  });
  // Alleen de rij die daadwerkelijk verwerkt wordt, mag spinnen/disablen — niet alle rijen.
  const pendingRequestId = decisionMutation.isPending
    ? (decisionMutation.variables as { requestId: string } | undefined)?.requestId ?? null
    : null;

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-team-member", {
        body: { user_id: userId },
      });
      if (error) {
        // Bij een non-2xx geeft supabase-js een generieke fout; lees de echte
        // boodschap uit de response-body van de edge function.
        let msg = error.message;
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.message) msg = body.message;
        } catch { /* body niet leesbaar — val terug op generieke melding */ }
        throw new Error(msg);
      }
      const res = data as { status?: string; message?: string };
      if (res?.status !== "deleted") throw new Error(res?.message || "Verwijderen mislukt");
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-profiles"] });
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      setDeleteTarget(null);
      toast.success("Teamlid verwijderd");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Verwijderen mislukt"),
  });

  return (
    <>
      {canHandleRequests && (pendingRequests ?? []).length > 0 && (
        <Card className="portal-card mb-4 border-amber-500/30">
          <CardContent className="p-0">
            <div className="p-5 border-b border-border">
              <h2 className="text-base font-semibold inline-flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-amber-500" /> Toegangsverzoeken
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                E-group-medewerkers die hebben ingelogd en op een rol wachten. Ken een rol toe → ze kunnen meteen werken.
                {!isSuperadmin && " Admin/manager kan alleen de superadmin toekennen."}
              </p>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {(pendingRequests ?? []).map((reqRow) => (
                  <tr key={reqRow.id} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <div className="font-medium">{reqRow.full_name || reqRow.email}</div>
                      <div className="text-xs text-muted-foreground">{reqRow.email}</div>
                    </td>
                    <td className="p-3">
                      <Select value={requestRoles[reqRow.id] ?? "viewer"} onValueChange={(v) => setRequestRoles((m) => ({ ...m, [reqRow.id]: v }))}>
                        <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {assignableRoles.map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <Button size="sm" disabled={pendingRequestId === reqRow.id}
                        onClick={() => decisionMutation.mutate({ requestId: reqRow.id, action: "approve", role: requestRoles[reqRow.id] ?? "viewer" })}>
                        {pendingRequestId === reqRow.id && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Toekennen
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pendingRequestId === reqRow.id}
                        onClick={() => decisionMutation.mutate({ requestId: reqRow.id, action: "deny" })}>
                        Weigeren
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Card className="portal-card">
        <CardContent className="p-0">
          <div className="flex flex-row items-center justify-between p-5 border-b border-border">
            <div>
              <h2 className="text-base font-semibold">Interne gebruikers</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Medewerkers loggen in via Microsoft (e-group). Nieuwe medewerkers verschijnen hierboven als toegangsverzoek; ken een rol toe om ze toegang te geven.
                {isSuperadmin ? " Alleen jij (superadmin) kunt teamleden verwijderen." : ""}
              </p>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-3 cockpit-section-label">Naam</th>
                <th className="text-left p-3 cockpit-section-label">User ID</th>
                <th className="text-left p-3 cockpit-section-label">Rol</th>
                {isSuperadmin && <th className="text-right p-3 cockpit-section-label">Actie</th>}
              </tr>
            </thead>
            <tbody>
              {profilesLoading || userRolesLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="p-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-48" /></td>
                    <td className="p-3"><Skeleton className="h-4 w-16" /></td>
                    {isSuperadmin && <td className="p-3"><Skeleton className="h-4 w-8 ml-auto" /></td>}
                  </tr>
                ))
              ) : internalProfiles.length === 0 ? (
                <tr><td colSpan={isSuperadmin ? 4 : 3} className="p-8 text-center text-muted-foreground">Geen gebruikers gevonden</td></tr>
              ) : (
                internalProfiles.map((p) => {
                  const userIsSuperadmin = isSuperadminUser(p.user_id);
                  return (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                    <td className="p-3 font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        {p.full_name || "—"}
                        {userIsSuperadmin && <ShieldCheck className="w-3.5 h-3.5 text-primary" />}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground text-xs font-mono">{p.user_id?.slice(0, 8)}…</td>
                    <td className="p-3">
                      <Badge
                        variant={userIsSuperadmin || getRoleForUser(p.user_id) === "admin" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {getRoleForUser(p.user_id)}
                      </Badge>
                    </td>
                    {isSuperadmin && (
                      <td className="p-3 text-right">
                        {canDeleteUser(p.user_id) ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(p)}
                            aria-label="Teamlid verwijderen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {p.user_id === user?.id ? "jij" : userIsSuperadmin ? "beschermd" : ""}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Teamlid verwijderen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <p>
              Weet je zeker dat je{" "}
              <strong>{deleteTarget?.full_name || "deze gebruiker"}</strong> wilt verwijderen?
            </p>
            <p className="text-muted-foreground text-xs">
              Het account en alle toegang tot het beheer-portaal worden definitief verwijderd. Dit kan niet ongedaan worden gemaakt.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>Annuleren</Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.user_id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Verwijderen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
