import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completePasswordReset } from "@/services/clientPaymentDetails";
import { supabase } from "@/integrations/supabase/client";
import { evaluatePassword } from "@/lib/passwordStrength";
import { PasswordStrengthMeter, usePasswordStrength } from "@/components/PasswordStrengthMeter";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const pwStrength = usePasswordStrength(newPassword);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const evalResult = await evaluatePassword(newPassword);
    if (!evalResult.ok) {
      setError(evalResult.warningNl ?? "Kies een sterker wachtwoord");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Wachtwoorden komen niet overeen");
      return;
    }

    setSaving(true);
    try {
      await completePasswordReset(newPassword);
      await supabase.auth.signOut();
      toast.success("Wachtwoord gewijzigd. Log opnieuw in.");
      navigate("/login", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Wachtwoord herstellen mislukt";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="portal-theme flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Card className="portal-card w-full max-w-md">
        <CardContent className="p-6">
          <div className="mb-6">
            <h1 className="text-xl font-semibold">Wachtwoord herstellen</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Kies een nieuw wachtwoord via de herstel-link uit uw e-mail.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="new-password">Nieuw wachtwoord</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                className="mt-2 portal-card"
                required
              />
              <PasswordStrengthMeter result={pwStrength.result} loading={pwStrength.loading} />
            </div>

            <div>
              <Label htmlFor="confirm-password">Herhaal nieuw wachtwoord</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="mt-2 portal-card"
                required
              />
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={saving || !pwStrength.result.ok}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Wachtwoord opslaan
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
