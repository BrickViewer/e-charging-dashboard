import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import logoBright from "@/assets/logo-bright.svg";
import { evaluatePassword } from "@/lib/passwordStrength";
import { PasswordStrengthMeter, usePasswordStrength } from "@/components/PasswordStrengthMeter";

interface InvitationInfo {
  status: "valid" | "already_accepted" | "revoked" | "expired" | "not_found";
  email?: string;
  client_number?: number;
  company_name?: string;
  contact_name?: string;
  message?: string;
}

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const pwStrength = usePasswordStrength(password, [info?.email ?? "", info?.company_name ?? "", info?.contact_name ?? ""]);

  useEffect(() => {
    if (!token) {
      setInfo({ status: "not_found", message: "Geen token in URL" });
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-client-invitation?token=${encodeURIComponent(token)}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          },
        );
        const json = await res.json();
        setInfo(json);
      } catch (err) {
        setInfo({
          status: "not_found",
          message: err instanceof Error ? err.message : "Uitnodiging kon niet worden geladen",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const evalResult = await evaluatePassword(password, [info?.email ?? "", info?.company_name ?? "", info?.contact_name ?? ""]);
    if (!evalResult.ok) {
      toast.error(evalResult.warningNl ?? "Kies een sterker wachtwoord");
      return;
    }
    if (password !== confirmPw) {
      toast.error("Wachtwoorden komen niet overeen");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-client-invitation`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token, password }),
        },
      );
      const json = await res.json();

      if (json.status !== "accepted") {
        toast.error(json.message || "Account aanmaken mislukt");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: info!.email!,
        password,
      });

      if (signInError) {
        toast.success("Account aangemaakt. Log in om uw gegevens aan te vullen.");
        navigate("/login");
        return;
      }

      toast.success("Welkom. We nemen u in een paar stappen mee door uw gegevens.");
      setTimeout(() => navigate("/portal/welkom"), 650);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="portal-theme relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(5,165,0,0.26),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[linear-gradient(180deg,rgba(0,0,0,0.72),transparent)]" />

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="grid w-full max-w-5xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="portal-card hidden min-h-[520px] flex-col justify-between p-8 lg:flex">
            <div>
              <img src={logoBright} alt="E-Charging" className="h-9 w-auto" />
              <div className="mt-16">
                <p className="cockpit-section-label text-primary">Klantportaal</p>
                <h1 className="mt-4 max-w-sm text-4xl font-semibold leading-tight text-foreground">
                  Activeer veilig uw E-Charging account
                </h1>
                <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">
                  Na activatie vult u uw bedrijfs-, factuur- en bankgegevens aan. Daarna koppelt E-Charging de juiste locaties aan uw klantprofiel.
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              E-Charging is onderdeel van E-Group BV.
            </p>
          </section>

          <Card className="portal-card min-h-[520px] border-primary/15 bg-card/80 shadow-2xl shadow-black/30">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-8 flex items-center justify-between gap-4 lg:hidden">
                <img src={logoBright} alt="E-Charging" className="h-8 w-auto" />
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  Klantportaal
                </span>
              </div>

              {loading && <LoadingState />}
              {!loading && info?.status === "valid" && (
                <ValidState
                  info={info}
                  password={password}
                  setPassword={setPassword}
                  confirmPw={confirmPw}
                  setConfirmPw={setConfirmPw}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  submitting={submitting}
                  onSubmit={handleSubmit}
                  strength={pwStrength}
                />
              )}
              {!loading && info?.status === "already_accepted" && (
                <InvalidState
                  title="Account al actief"
                  message="Deze uitnodiging is al gebruikt om een klantaccount te activeren."
                  action={
                    <Button onClick={() => navigate("/login")}>
                      Naar inloggen <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  }
                />
              )}
              {!loading && info?.status === "expired" && (
                <InvalidState
                  title="Uitnodiging verlopen"
                  message="Deze uitnodiging is niet meer geldig. Vraag E-Charging om een nieuwe uitnodiging."
                />
              )}
              {!loading && info?.status === "revoked" && (
                <InvalidState
                  title="Uitnodiging ingetrokken"
                  message="Deze uitnodiging is door E-Charging ingetrokken."
                />
              )}
              {!loading && info?.status === "not_found" && (
                <InvalidState
                  title="Uitnodiging niet gevonden"
                  message="Deze link is ongeldig. Controleer of u de volledige link uit de mail heeft gekopieerd."
                />
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4 py-8">
      <Skeleton className="mx-auto h-8 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="space-y-3 pt-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

function ValidState({
  info,
  password,
  setPassword,
  confirmPw,
  setConfirmPw,
  showPassword,
  setShowPassword,
  submitting,
  onSubmit,
  strength,
}: {
  info: InvitationInfo;
  password: string;
  setPassword: (s: string) => void;
  confirmPw: string;
  setConfirmPw: (s: string) => void;
  showPassword: boolean;
  setShowPassword: (b: boolean) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  strength: ReturnType<typeof usePasswordStrength>;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <p className="cockpit-section-label text-primary">Account activeren</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">
          Welkom, {info.contact_name || "klant"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Kies een wachtwoord voor het portaal van{" "}
          <span className="font-medium text-foreground">{info.company_name}</span>.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryItem label="Klantnummer" value={info.client_number ? `#${info.client_number}` : "Nog niet bekend"} />
        <SummaryItem label="Login e-mail" value={info.email ?? "Niet bekend"} />
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="password" className="text-sm font-medium">
            Wachtwoord
          </Label>
          <div className="relative mt-1.5">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimaal 10 tekens"
              required
              minLength={10}
              autoComplete="new-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <PasswordStrengthMeter result={strength.result} loading={strength.loading} />
        </div>
        <div>
          <Label htmlFor="confirm" className="text-sm font-medium">
            Wachtwoord bevestigen
          </Label>
          <Input
            id="confirm"
            type={showPassword ? "text" : "password"}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="Herhaal wachtwoord"
            required
            minLength={10}
            autoComplete="new-password"
            className="mt-1.5"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={submitting || !strength.result.ok || password !== confirmPw}
        className="w-full"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Account aanmaken...
          </>
        ) : (
          <>
            Account activeren
            <CheckCircle className="ml-2 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/80 bg-background/25 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function InvalidState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center py-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-400/25 bg-amber-400/10">
        <AlertCircle className="h-6 w-6 text-amber-300" />
      </div>
      <h1 className="mt-5 text-xl font-semibold text-foreground">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
