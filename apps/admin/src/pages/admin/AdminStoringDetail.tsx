import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, MapPin, Zap, Send, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ConnectivityIndicator } from "@/components/admin/ConnectivityIndicator";
import { formatPhone, phoneHref } from "@/lib/phone";
import { useFault, useBestContact, useAdvanceFault, useAddFaultNote, useResendFaultEmail } from "@/hooks/useFaults";
import {
  availableActions, resolveBestContact, isOpenStatus, CLOSED_STATUSES,
  FAULT_STATUS_LABELS, FAULT_REASON_LABELS, type FaultAction, type FaultStatus,
} from "@/services/faults";

const rel = (d: string | null) => (d ? formatDistanceToNow(new Date(d), { addSuffix: true, locale: nl }) : "onbekend");
const idJoin = (...p: (string | number | null | undefined)[]) => p.filter((x) => x !== null && x !== undefined && String(x).trim() !== "").join(" / ") || "onbekend";

// Menselijke labels voor tijdlijn-events zonder eigen notitie (i.p.v. de ruwe enum).
const EVENT_TYPE_LABELS: Record<string, string> = {
  status_change: "Statuswijziging",
  note: "Notitie",
  email_sent: "Storingsmail verstuurd",
};

// Statusbadge consistent met de lijst (statusBadge in AdminStoringen): "vals alarm"
// is neutraal/muted, niet groen-"opgelost".
function statusBadgeClass(status: FaultStatus): string {
  if (status === "opgelost" || status === "automatisch_hersteld") return "bg-green-600 hover:bg-green-600/90";
  if (status === "vals_alarm") return "bg-muted text-muted-foreground";
  if (isOpenStatus(status)) return "bg-destructive/15 text-destructive border border-destructive/30";
  return "bg-muted";
}

export default function AdminStoringDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fault = useFault(id);
  const f = fault.data;
  const contacts = useBestContact(f?.clients?.company_id ?? undefined);
  const advance = useAdvanceFault();
  const addNote = useAddFaultNote();
  const resend = useResendFaultEmail();
  const [visitDate, setVisitDate] = useState("");
  const [note, setNote] = useState("");

  if (fault.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (fault.isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/admin/storingen")}><ArrowLeft className="w-4 h-4 mr-1.5" /> Terug</Button>
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> <span className="text-sm font-medium">Storing kon niet worden geladen</span></div>
            <p className="text-sm text-muted-foreground">{fault.error instanceof Error ? fault.error.message : "Onbekende fout"}</p>
            <Button variant="outline" size="sm" onClick={() => fault.refetch()}>Opnieuw proberen</Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!f) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/admin/storingen")}><ArrowLeft className="w-4 h-4 mr-1.5" /> Terug</Button>
        <p className="text-muted-foreground">Storing niet gevonden.</p>
      </div>
    );
  }

  const cp = f.charge_points;
  const loc = f.locations;
  const cl = f.clients;
  const contact = resolveBestContact(cl, contacts.data);
  const addr = [loc?.address, [loc?.postal_code, loc?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const open = isOpenStatus(f.status);

  const doAction = async (action: FaultAction) => {
    if (action.needsDate && !visitDate) { toast.error("Kies eerst een bezoekdatum"); return; }
    try {
      await advance.mutateAsync({ fault: f, action, visitDate: action.needsDate ? visitDate : undefined });
      toast.success(`${action.label} vastgelegd`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Actie mislukt"); }
  };

  const doNote = async () => {
    if (!note.trim()) return;
    try { await addNote.mutateAsync({ faultId: f.id, note: note.trim() }); setNote(""); toast.success("Notitie toegevoegd"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Mislukt"); }
  };

  const doResend = async () => {
    try {
      const res = await resend.mutateAsync(f.id);
      if (res.status === "ok") toast.success("Storingsmail opnieuw verstuurd");
      else if (res.status === "already_sent") toast.info("Mail was al verstuurd");
      else if (res.status === "not_configured") toast.warning("E-mail (Resend) is niet geconfigureerd");
      else toast.error(res.message ?? "Versturen mislukt");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Versturen mislukt"); }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => navigate("/admin/storingen")}><ArrowLeft className="w-4 h-4 mr-1.5" /> Storingen</Button>
        <div className="flex items-center gap-2">
          <Badge className={statusBadgeClass(f.status)}>{FAULT_STATUS_LABELS[f.status]}</Badge>
          <Button variant="outline" size="sm" onClick={doResend} disabled={resend.isPending}><Send className="w-3.5 h-3.5 mr-1.5" /> Mail opnieuw</Button>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-destructive" /> {cp?.name || "Laadpunt"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cl?.company_name}{cl?.client_number ? ` · #${cl.client_number}` : ""} · gedetecteerd {rel(f.detected_at)}
          {" · "}<span className="text-destructive">{FAULT_REASON_LABELS[f.fault_reason as keyof typeof FAULT_REASON_LABELS] ?? f.fault_reason}</span>
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Paal-identifiers voor e-Flux */}
        <Card className="portal-card">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Zap className="w-4 h-4" /> Laadpunt (voor e-Flux)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Field label="e-Flux EVSE-ID" value={cp?.eflux_evse_id} mono />
            <Field label="Controller-ID" value={cp?.eflux_evse_controller_id} mono />
            <Field label="Serienummer" value={cp?.serial_number} mono />
            <Field label="Merk / model" value={idJoin(cp?.brand, cp?.model)} />
            <Field label="Vermogen" value={cp?.max_power ? `${cp.max_power} kW` : null} />
            <div className="pt-2 border-t">
              <p className="cockpit-section-label mb-1">Live status</p>
              <ConnectivityIndicator state={cp?.connectivity_state ?? "unknown"} />
              <p className="text-xs text-muted-foreground mt-1">Operationeel: {cp?.operational_status ?? "onbekend"} · hartslag {rel(cp?.last_heartbeat_at ?? null)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Locatie + contact */}
        <Card className="portal-card">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MapPin className="w-4 h-4" /> Locatie & contact</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">{loc?.name || "Onbekende locatie"}</p>
              <p className="text-muted-foreground">{addr || "Adres onbekend"}</p>
            </div>
            <div className="pt-2 border-t">
              <p className="cockpit-section-label mb-1">Bel deze contactpersoon</p>
              <p className="font-medium">{contact.name || "Geen contact bekend"}{contact.role ? <span className="text-muted-foreground font-normal"> · {contact.role}</span> : null}</p>
              <div className="flex flex-col gap-1.5 mt-2">
                {contact.phone && <a href={`tel:${phoneHref(contact.phone)}`} className="inline-flex items-center gap-2 text-primary hover:underline"><Phone className="w-4 h-4" /> {formatPhone(contact.phone)}</a>}
                {contact.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-2 text-primary hover:underline"><Mail className="w-4 h-4" /> {contact.email}</a>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actieflow */}
        <Card className="portal-card">
          <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Afhandeling</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {open ? (
              <>
                <div className="grid gap-2">
                  {availableActions(f.status).map((a) => (
                    a.needsDate ? (
                      <div key={a.key} className="flex items-center gap-2">
                        <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} aria-label="Bezoekdatum" className="h-9" />
                        <Button size="sm" variant="outline" onClick={() => doAction(a)} disabled={advance.isPending}>{a.label}</Button>
                      </div>
                    ) : CLOSED_STATUSES.includes(a.toStatus) ? (
                      // Afsluitende acties (Opgelost / Vals alarm) vragen om bevestiging: onomkeerbaar.
                      <AlertDialog key={a.key}>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant={a.toStatus === "opgelost" ? "default" : "outline"} disabled={advance.isPending} className="justify-start">{a.label}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Storing afsluiten?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{a.label}" sluit deze storing af. Dit is niet met één klik terug te draaien.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuleren</AlertDialogCancel>
                            <AlertDialogAction onClick={() => doAction(a)}>{a.label}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <Button key={a.key} size="sm" variant="outline" onClick={() => doAction(a)} disabled={advance.isPending} className="justify-start">{a.label}</Button>
                    )
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Deze storing is afgehandeld{f.resolved_at ? ` (${rel(f.resolved_at)})` : ""}.</p>
            )}
            <div className="pt-2 border-t space-y-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notitie toevoegen" aria-label="Notitie toevoegen" className="h-9" onKeyDown={(e) => e.key === "Enter" && doNote()} />
              <Button size="sm" variant="ghost" onClick={doNote} disabled={addNote.isPending || !note.trim()}>Notitie opslaan</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tijdlijn */}
      <Card className="portal-card">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> Tijdlijn</CardTitle></CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {(f.events ?? []).map((ev) => (
              <li key={ev.id} className="flex gap-3 text-sm">
                <span className="mt-1 w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                <div>
                  <p>{ev.note || EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(ev.created_at), "d MMM yyyy HH:mm", { locale: nl })}</p>
                </div>
              </li>
            ))}
            {(f.events ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nog geen gebeurtenissen.</p>}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | number | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs text-right break-all" : "text-right"}>{value || "—"}</span>
    </div>
  );
}
