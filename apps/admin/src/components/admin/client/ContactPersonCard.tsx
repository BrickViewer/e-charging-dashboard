import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/contacts/PhoneField";
import { formatPhone } from "@/lib/phone";
import type { ClientWithRelations } from "@/types/db";
import { ClientDetailRow, splitContactName } from "./clientDetailUtils";

export function ContactPersonCard({
  client,
  isEditing,
  ed,
  setEd,
}: {
  client: ClientWithRelations;
  isEditing: boolean;
  ed: Record<string, string | number | null>;
  setEd: (field: string, value: string | number | null) => void;
}) {
  const contactName = splitContactName(client.contact_name);

  return (
    <Card className="portal-card">
      <CardHeader><CardTitle className="text-base">Contactpersoon</CardTitle></CardHeader>
      <CardContent className="text-sm">
        {isEditing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Voornaam</Label><Input value={ed.contact_first_name ?? ""} onChange={e => setEd("contact_first_name", e.target.value)} /></div>
              <div><Label>Achternaam</Label><Input value={ed.contact_last_name ?? ""} onChange={e => setEd("contact_last_name", e.target.value)} /></div>
            </div>
            <div><Label>E-mail</Label><Input type="email" value={ed.contact_email ?? ""} onChange={e => setEd("contact_email", e.target.value)} /></div>
            <div><Label>Telefoonnummer</Label><PhoneField value={String(ed.contact_phone ?? "")} onChange={(v) => setEd("contact_phone", v)} /></div>
          </div>
        ) : (
          <div className="space-y-0">
            <ClientDetailRow label="Voornaam" value={contactName.firstName} />
            <ClientDetailRow label="Achternaam" value={contactName.lastName} />
            <ClientDetailRow label="E-mail" value={client.contact_email} />
            <ClientDetailRow label="Telefoonnummer" value={client.contact_phone ? formatPhone(client.contact_phone) : null} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
