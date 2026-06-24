import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Clock, AlertTriangle, User, Building2 } from "lucide-react";
import type { SignableAdmin } from "@/hooks/useSignableAdmins";

const fmtDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
};

type Step = { tone: "done" | "pending" | "idle"; text: string };
function StatusChip({ step }: { step: Step }) {
  const cls =
    step.tone === "done" ? "bg-green-100 text-green-700"
    : step.tone === "pending" ? "bg-amber-100 text-amber-700"
    : "bg-muted text-muted-foreground";
  const Icon = step.tone === "done" ? CheckCircle2 : step.tone === "pending" ? Clock : Clock;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3 w-3" /> {step.text}
    </span>
  );
}

export function SignerStatusPanel({
  status,
  internalSignerName,
  internalSignedAt,
  customerCompany,
  customerContact,
  customerSignerName,
  customerSignedAt,
  admins,
  signerUserId,
  onSignerChange,
  currentUserId,
  editable,
}: {
  status: string;
  internalSignerName?: string | null;
  internalSignedAt?: string | null;
  customerCompany?: string | null;
  customerContact?: string | null;
  customerSignerName?: string | null;
  customerSignedAt?: string | null;
  admins: SignableAdmin[];
  signerUserId: string | null;
  onSignerChange: (v: string | null) => void;
  currentUserId?: string;
  editable: boolean;
}) {
  const selected = admins.find((a) => a.userId === signerUserId);
  const internalDone = !!internalSignedAt || ["verstuurd", "getekend"].includes(status);
  const internalStep: Step = internalDone
    ? { tone: "done", text: `Getekend${internalSignedAt ? ` · ${fmtDate(internalSignedAt)}` : ""}` }
    : status === "intern_ter_ondertekening"
      ? { tone: "pending", text: "Ter ondertekening" }
      : { tone: "idle", text: "Nog niet verstuurd" };

  const customerStep: Step = status === "getekend"
    ? { tone: "done", text: `Getekend${customerSignedAt ? ` · ${fmtDate(customerSignedAt)}` : ""}` }
    : status === "verstuurd"
      ? { tone: "pending", text: "Te ondertekenen" }
      : { tone: "idle", text: "Nog niet aan de beurt" };

  const internalName = internalSignerName || selected?.fullName || "—";

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ondertekenaars</p>

      {/* E-Charging (interne ondertekenaar) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground"><User className="h-3.5 w-3.5 text-muted-foreground" /> E-Charging</span>
          <StatusChip step={internalStep} />
        </div>
        {editable ? (
          <div className="space-y-1">
            <Label className="sr-only">Ondertekenaar</Label>
            <Select value={signerUserId ?? ""} onValueChange={(v) => onSignerChange(v || null)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Kies ondertekenaar…" /></SelectTrigger>
              <SelectContent>
                {admins.map((a) => (
                  <SelectItem key={a.userId} value={a.userId}>
                    {a.fullName}{a.userId === currentUserId ? " (jij)" : ""}{a.hasSignature ? "" : " — geen handtekening"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {signerUserId && !selected?.hasSignature ? (
              <p className="flex items-center gap-1 text-[11px] text-amber-600"><AlertTriangle className="h-3 w-3" /> Deze ondertekenaar heeft nog geen handtekening ingesteld.</p>
            ) : signerUserId && selected?.userId === currentUserId ? (
              <p className="text-[11px] text-muted-foreground">Je tekent zelf — de offerte gaat direct naar de klant.</p>
            ) : signerUserId ? (
              <p className="text-[11px] text-muted-foreground">{selected?.fullName} krijgt een e-mail om te beoordelen en te tekenen.</p>
            ) : null}
          </div>
        ) : status === "intern_ter_ondertekening" ? (
          <p className="text-[11px] text-muted-foreground">Wacht op goedkeuring van <span className="font-medium text-foreground">{internalName}</span>{signerUserId && signerUserId === currentUserId ? " (jij)" : ""}.</p>
        ) : (
          <p className="text-sm text-foreground">{internalName}</p>
        )}
      </div>

      {/* Klant */}
      <div className="flex items-center justify-between gap-2 border-t pt-2.5">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-medium text-foreground"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Klant</span>
          <p className="truncate text-sm text-foreground">{customerSignerName || customerContact || customerCompany || "—"}</p>
        </div>
        <StatusChip step={customerStep} />
      </div>
    </div>
  );
}
