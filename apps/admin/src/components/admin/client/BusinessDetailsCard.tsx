import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AddressFields } from "@/components/contacts/AddressFields";
import type { ClientWithRelations } from "@/types/db";
import { ClientDetailRow } from "./clientDetailUtils";
import { VatStatusBlock } from "./VatStatusBlock";
import { EreStatusBlock } from "./EreStatusBlock";

export function BusinessDetailsCard({
  client,
  clientId,
  isEditing,
  ed,
  setEd,
  errors,
}: {
  client: ClientWithRelations;
  clientId: string | undefined;
  isEditing: boolean;
  ed: Record<string, string | number | null>;
  setEd: (field: string, value: string | number | null) => void;
  errors: Record<string, string>;
}) {
  return (
    <Card className="portal-card">
      <CardHeader><CardTitle className="text-base">Klantgegevens</CardTitle></CardHeader>
      <CardContent className="text-sm">
        {isEditing ? (
          <div className="space-y-3">
            <div>
              <Label>Klantnummer</Label>
              <Input
                type="number"
                min={101}
                value={ed.client_number ?? ""}
                onChange={e => setEd("client_number", e.target.value)}
                className={errors.client_number ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              {errors.client_number && (
                <p className="mt-1 text-xs text-destructive">{errors.client_number}</p>
              )}
            </div>
            <div><Label>Naam</Label><Input value={ed.company_name ?? ""} onChange={e => setEd("company_name", e.target.value)} /></div>
            <div><Label>KvK-nummer</Label><Input value={ed.kvk ?? ""} onChange={e => setEd("kvk", e.target.value)} /></div>
            <div><Label>BTW-nummer</Label><Input value={ed.btw_number ?? ""} onChange={e => setEd("btw_number", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Factuuradres</Label>
              <AddressFields
                value={{
                  street: String(ed.billing_address_street ?? ""),
                  houseNumber: String(ed.billing_house ?? ""),
                  postalCode: String(ed.billing_address_postal ?? ""),
                  city: String(ed.billing_address_city ?? ""),
                }}
                onChange={(patch) => {
                  if (patch.street !== undefined) setEd("billing_address_street", patch.street);
                  if (patch.houseNumber !== undefined) setEd("billing_house", patch.houseNumber);
                  if (patch.postalCode !== undefined) setEd("billing_address_postal", patch.postalCode);
                  if (patch.city !== undefined) setEd("billing_address_city", patch.city);
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
              <Label htmlFor="admin-calculate-ere">Bereken ERE's</Label>
              <Switch
                id="admin-calculate-ere"
                checked={ed.calculate_ere_enabled === "true"}
                onCheckedChange={(checked) => setEd("calculate_ere_enabled", checked ? "true" : "false")}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            <ClientDetailRow label="Klantnummer" value={client.client_number ? `#${client.client_number}` : "Niet actief"} />
            <ClientDetailRow label="Naam" value={client.company_name} />
            <ClientDetailRow label="KvK-nummer" value={client.kvk} />
            <ClientDetailRow label="BTW-nummer" value={client.btw_number} />
            <ClientDetailRow label="Factuuradres" value={client.billing_address_street} />
            <ClientDetailRow label="Postcode" value={client.billing_address_postal} />
            <ClientDetailRow label="Plaats" value={client.billing_address_city} />
            <ClientDetailRow label="Bereken ERE's" value={client.calculate_ere_enabled ? "Ja" : "Nee"} />
          </div>
        )}
        {/* BTW-status loopt buiten de gewone edit-flow: host geeft op, admin
            bevestigt via een eigen RPC (vereist voor goedkeuren/factureren). */}
        <VatStatusBlock client={client} clientId={clientId} />
        {/* ERE-interesse: klant vinkt in het portaal aan; team volgt op en markeert als geregeld. */}
        <EreStatusBlock client={client} clientId={clientId} />
      </CardContent>
    </Card>
  );
}
