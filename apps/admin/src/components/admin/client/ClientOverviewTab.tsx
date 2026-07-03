import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientPaymentDetails, ClientWithRelations } from "@/types/db";
import { ContactPersonCard } from "./ContactPersonCard";
import { BusinessDetailsCard } from "./BusinessDetailsCard";
import { InvoiceAndBankDetailsCard } from "./InvoiceAndBankDetailsCard";

export function ClientOverviewTab({
  client,
  clientId,
  isEditing,
  ed,
  setEd,
  editErrors,
  paymentDetails,
}: {
  client: ClientWithRelations;
  clientId: string | undefined;
  isEditing: boolean;
  ed: Record<string, string | number | null>;
  setEd: (field: string, value: string | number | null) => void;
  editErrors: Record<string, string>;
  paymentDetails?: ClientPaymentDetails | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ContactPersonCard client={client} isEditing={isEditing} ed={ed} setEd={setEd} />
      <BusinessDetailsCard client={client} clientId={clientId} isEditing={isEditing} ed={ed} setEd={setEd} errors={editErrors} />
      <InvoiceAndBankDetailsCard client={client} paymentDetails={paymentDetails} />
      <Card className="portal-card">
        <CardHeader><CardTitle className="text-base">Contract</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2">
          {isEditing ? (
            <div className="space-y-3">
              <div><Label>Startdatum</Label><Input type="date" value={ed.contract_start_date} onChange={e => setEd("contract_start_date", e.target.value)} /></div>
              <div><Label>Looptijd (maanden)</Label><Input type="number" value={ed.contract_duration_months} onChange={e => setEd("contract_duration_months", e.target.value)} /></div>
              <div><Label>Standaard E-Charging fee (€/kWh, leeg = €0,10)</Label><Input type="number" step="0.01" placeholder="standaard 0,10" value={ed.echarging_fee_per_kwh} onChange={e => setEd("echarging_fee_per_kwh", e.target.value)} /></div>
              <p className="text-[11px] text-muted-foreground">Terugval-fee voor locaties zonder eigen tarief. Laad-/start-/blokkeertarief én de service-fee per locatie stel je in op de locatiepagina.</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p><span className="text-muted-foreground">Startdatum:</span> {client.contract_start_date || "—"}</p>
              <p><span className="text-muted-foreground">Looptijd:</span> {client.contract_duration_months} maanden</p>
              <p><span className="text-muted-foreground">Standaard E-Charging fee:</span> {client.echarging_fee_per_kwh != null ? `€${Number(client.echarging_fee_per_kwh).toFixed(2)}/kWh` : "standaard (€0,10/kWh)"}</p>
              <p className="text-[11px] text-muted-foreground">Tarieven gelden per locatie — zie de locatiepagina.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
