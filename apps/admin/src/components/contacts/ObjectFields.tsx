import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useProjectLocation, useUpdateProjectLocation } from "@/hooks/useProjectLocations";
import { AddressFields, type AddressValue } from "@/components/contacts/AddressFields";

// Herbruikbare object-editor (zoals CompanyFields/PersonFields): schrijft direct naar het project_location-record.
export function ObjectFields({ objectId }: { objectId: string }) {
  const { data: obj, isLoading } = useProjectLocation(objectId);
  const update = useUpdateProjectLocation();
  const [name, setName] = useState("");
  const [addr, setAddr] = useState<AddressValue>({ street: "", houseNumber: "", postalCode: "", city: "" });
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (obj) {
      setName(obj.display_name ?? "");
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
          display_name: name.trim() || obj.display_name,
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
      <div className="space-y-1.5"><Label className="text-xs">Objectnaam</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="bijv. Hoofdkantoor of een herkenbare naam" /></div>
      <AddressFields value={addr} onChange={(p) => setAddr((a) => ({ ...a, ...p }))} />
      <div className="space-y-1.5"><Label className="text-xs">Notities</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="flex justify-end"><Button onClick={save} disabled={update.isPending}>{update.isPending ? "Opslaan…" : "Object opslaan"}</Button></div>
    </div>
  );
}
