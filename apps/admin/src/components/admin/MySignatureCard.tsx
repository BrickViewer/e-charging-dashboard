import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, PenLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SignaturePad } from "@/components/SignaturePad";

// Schaal een geüploade afbeelding terug naar een nette breedte en lever een PNG data-URL.
function fileToSignatureDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Inlezen mislukt"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Geen geldige afbeelding"));
      img.onload = () => {
        const maxW = 600;
        const scale = Math.min(1, maxW / img.width);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        if (!ctx) return reject(new Error("Canvas niet beschikbaar"));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function MySignatureCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"draw" | "upload">("draw");
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile-signature", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("signature_data_url, full_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile) {
      setSignature(profile.signature_data_url ?? null);
    }
  }, [profile]);

  const onUpload = async (file?: File) => {
    if (!file) return;
    try {
      setSignature(await fileToSignatureDataUrl(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload mislukt");
    }
  };

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      // Bewust geen signer_title meer: interne functietitels horen niet op offertes.
      const { error } = await supabase
        .from("profiles")
        .update({ signature_data_url: signature })
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Handtekening opgeslagen");
      qc.invalidateQueries({ queryKey: ["my-profile-signature", user.id] });
      qc.invalidateQueries({ queryKey: ["signable-admins"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="portal-card max-w-2xl">
      <CardContent className="p-5 space-y-5">
        <div>
          <h2 className="text-base font-semibold">Mijn handtekening</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Deze handtekening wordt op offertes gezet wanneer jij als ondertekenaar bent gekozen. Je hoeft dan bij het
            ondertekenen niet opnieuw te tekenen.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Laden…</div>
        ) : (
          <>
            <div className="flex gap-2">
              <Button type="button" variant={mode === "draw" ? "default" : "outline"} size="sm" onClick={() => setMode("draw")}>
                <PenLine className="w-4 h-4 mr-1" /> Tekenen
              </Button>
              <Button type="button" variant={mode === "upload" ? "default" : "outline"} size="sm" onClick={() => setMode("upload")}>
                <Upload className="w-4 h-4 mr-1" /> Uploaden
              </Button>
            </div>

            {mode === "draw" ? (
              <SignaturePad onChange={setSignature} />
            ) : (
              <div className="space-y-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-1" /> Kies afbeelding (PNG/JPG)
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Huidige handtekening</Label>
              <div className="flex h-28 items-center justify-center rounded-lg border bg-white p-2">
                {signature ? (
                  <img src={signature} alt="Handtekening" className="max-h-24 max-w-full" />
                ) : (
                  <span className="text-xs text-muted-foreground">Nog geen handtekening ingesteld</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Opslaan
              </Button>
              {signature ? (
                <Button type="button" variant="ghost" onClick={() => setSignature(null)}>Wissen</Button>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
