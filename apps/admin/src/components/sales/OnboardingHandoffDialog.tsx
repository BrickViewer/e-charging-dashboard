import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PhoneField } from "@/components/contacts/PhoneField";
import { useHandoffOrder, useUpdateOrderSite } from "@/hooks/useInstallations";
import { primaryOrder, type OnboardingClient } from "@/hooks/useOnboarding";
import { DEFAULT_LEVERING_TEXT } from "@/services/offerTemplate";

const emptyToNull = (s: string) => { const t = s.trim(); return t === "" ? null : t; };

type SiteForm = {
  site_street: string; site_house_number: string; site_postal: string; site_city: string;
  site_contact_name: string; site_contact_email: string; site_contact_phone: string; service_summary: string;
  notes: string;
};

// Stuur de getekende opdracht naar de installateur (E-Group / e-portal): vul het site-adres
// + contact aan en verstuur. Server-side via de bestaande order-handoff edge fn (app-only).
export function OnboardingHandoffDialog({ client, onClose }: { client: OnboardingClient | null; onClose: () => void }) {
  const order = client ? primaryOrder(client) : null;
  const sent = !!order?.egroup_order_id;
  const qc = useQueryClient();
  const updateSite = useUpdateOrderSite();
  const handoff = useHandoffOrder();
  const [form, setForm] = useState<SiteForm>({
    site_street: "", site_house_number: "", site_postal: "", site_city: "",
    site_contact_name: "", site_contact_email: "", site_contact_phone: "", service_summary: "", notes: "",
  });

  useEffect(() => {
    if (!order) return;
    // Voorgevuld uit het order (door create_client_from_quote uit de offerte gevuld); fallback op de klant.
    setForm({
      site_street: order.site_street ?? client?.billing_address_street ?? "",
      site_house_number: order.site_house_number ?? "",
      site_postal: order.site_postal ?? client?.billing_address_postal ?? "",
      site_city: order.site_city ?? client?.billing_address_city ?? "",
      site_contact_name: order.site_contact_name ?? client?.contact_name ?? "",
      site_contact_email: order.site_contact_email ?? client?.contact_email ?? "",
      site_contact_phone: order.site_contact_phone ?? client?.contact_phone ?? "",
      service_summary: order.service_summary ?? "",
      notes: order.notes ?? DEFAULT_LEVERING_TEXT,
    });
  }, [order?.id, client?.contact_name, client?.contact_email, client?.contact_phone, client?.billing_address_street, client?.billing_address_postal, client?.billing_address_city]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSend = !!(form.site_street.trim() && form.site_house_number.trim() && form.site_postal.trim() && form.site_city.trim());
  const busy = updateSite.isPending || handoff.isPending;

  const submit = async () => {
    if (!order || !canSend) { toast.error("Vul straat, huisnummer, postcode en plaats in"); return; }
    try {
      await updateSite.mutateAsync({ id: order.id, patch: {
        site_street: emptyToNull(form.site_street), site_house_number: emptyToNull(form.site_house_number),
        site_postal: emptyToNull(form.site_postal), site_city: emptyToNull(form.site_city),
        site_contact_name: emptyToNull(form.site_contact_name), site_contact_email: emptyToNull(form.site_contact_email),
        site_contact_phone: emptyToNull(form.site_contact_phone), service_summary: emptyToNull(form.service_summary),
        notes: emptyToNull(form.notes),
      } });
      const res = await handoff.mutateAsync(order.id);
      if (res.status === "validation_error") { toast.error("Vul het site-adres compleet aan: straat, huisnummer, postcode, plaats"); return; }
      if (res.status === "not_configured") toast.warning("De installateur-koppeling (E-Group) is nog niet geconfigureerd");
      else toast.success(`Opdracht verstuurd naar de installateur${res.egroup_order_number ? ` (${res.egroup_order_number})` : ""}`);
      qc.invalidateQueries({ queryKey: ["onboarding-clients"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Versturen mislukt");
    }
  };

  return (
    <Dialog open={!!client} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Doorsturen naar installateur</DialogTitle>
          <DialogDescription>
            Vul het installatie-adres + contactpersoon aan; we sturen de opdracht naar de installateur (e-portal).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="oh_street">Straat</Label>
              <Input id="oh_street" value={form.site_street} onChange={(e) => setForm({ ...form, site_street: e.target.value })} disabled={sent} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oh_huisnr">Huisnr.</Label>
              <Input id="oh_huisnr" value={form.site_house_number} onChange={(e) => setForm({ ...form, site_house_number: e.target.value })} disabled={sent} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oh_postal">Postcode</Label>
              <Input id="oh_postal" value={form.site_postal} onChange={(e) => setForm({ ...form, site_postal: e.target.value })} disabled={sent} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="oh_city">Plaats</Label>
              <Input id="oh_city" value={form.site_city} onChange={(e) => setForm({ ...form, site_city: e.target.value })} disabled={sent} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="oh_cname">Contactpersoon op locatie</Label>
              <Input id="oh_cname" value={form.site_contact_name} onChange={(e) => setForm({ ...form, site_contact_name: e.target.value })} disabled={sent} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oh_cmail">E-mail</Label>
              <Input id="oh_cmail" value={form.site_contact_email} onChange={(e) => setForm({ ...form, site_contact_email: e.target.value })} disabled={sent} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oh_cphone">Telefoon</Label>
              <PhoneField id="oh_cphone" value={form.site_contact_phone} onChange={(v) => setForm({ ...form, site_contact_phone: v ?? "" })} disabled={sent} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="oh_notes">Opdrachtomschrijving</Label>
              <Textarea id="oh_notes" rows={6} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={sent} placeholder="Wat moet er gebeuren — overgenomen uit de offerte" />
              <p className="text-[11px] text-muted-foreground">Voorgevuld uit de offerte (Levering en installatie); wordt meegestuurd naar de installateur.</p>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="oh_notities">Notities</Label>
              <Textarea id="oh_notities" rows={3} value={form.service_summary} onChange={(e) => setForm({ ...form, service_summary: e.target.value })} disabled={sent} placeholder="Extra notities voor de installateur (optioneel)" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Annuleren</Button>
          <Button onClick={submit} disabled={busy || sent || !canSend}>
            <Send className="mr-1.5 h-4 w-4" /> {busy ? "Versturen…" : "Doorsturen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
