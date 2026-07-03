import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useProjectLocation, useUpdateProjectLocation } from "@/hooks/useProjectLocations";
import { AddressFields, type AddressValue } from "@/components/contacts/AddressFields";

// Herbruikbare object-editor. De objectnaam is afgeleid (adres + objectnummer) en dus read-only;
// het adres bewerken herberekent de naam + hernoemt de SharePoint-map automatisch (server-side).
export function ObjectFields({ objectId }: { objectId: string }) {
  const { data: obj, isLoading } = useProjectLocation(objectId);
  const update = useUpdateProjectLocation();
  const [addr, setAddr] = useState<AddressValue>({ street: "", houseNumber: "", postalCode: "", city: "" });
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (obj) {
      setAddr({ street: obj.address_street ?? "", houseNumber: obj.house_number ?? "", postalCode: obj.postal_code ?? "", city: obj.city ?? "" });
      setNotes(obj.notes ?? "");
    }
  }, [obj]);

  if (isLoading || !obj) return <div className="space-y-3"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>;

  const save = async () => {
    try {
      await update.mutateAsync({
        id: obj.id,
        patch: {
          // display_name NIET meesturen — server-trigger leidt 'm af uit het adres + objectnummer.
          address_street: addr.street.trim() || null,
          house_number: addr.houseNumber.trim() || null,
          postal_code: addr.postalCode.trim() || null,
          city: addr.city.trim() || null,
          notes: notes.trim() || null,
        },
      });
      toast.success("Object opgeslagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1"><Label className="text-xs">Objectnaam <span className="text-muted-foreground">(automatisch)</span></Label><p className="text-sm font-medium tabular-nums">{obj.display_name}</p></div>
      <AddressFields value={addr} onChange={(p) => setAddr((a) => ({ ...a, ...p }))} />
      <div className="space-y-1.5"><Label className="text-xs">Notities</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="flex justify-end"><Button onClick={save} disabled={update.isPending}>{update.isPending ? "Opslaan…" : "Object opslaan"}</Button></div>
    </div>
  );
}
