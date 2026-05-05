import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface InvitationInfo {
  status: "valid" | "already_accepted" | "revoked" | "expired" | "not_found";
  email?: string;
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
              "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
          },
        );
        const json = await res.json();
        setInfo(json);
      } catch (err: any) {
        setInfo({ status: "not_found", message: err.message });
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password.length < 8) {
      toast.error("Wachtwoord moet minimaal 8 tekens zijn");
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
            "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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

      // Auto-sign-in met de net aangemaakte credentials
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: info!.email!,
        password,
      });

      if (signInError) {
        toast.success("Account aangemaakt — log in via /login");
        navigate("/login");
        return;
      }

      toast.success("Welkom! U wordt doorgestuurd naar uw dashboard…");
      setTimeout(() => navigate("/portal"), 800);
    } catch (err: any) {
      toast.error(err.message || "Onbekende fout");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand-mark */}
        <div className="flex justify-center mb-6">
          <div
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold"
            style={{
              background: "linear-gradient(135deg, #008000 0%, #00a000 100%)",
              boxShadow: "0 4px 12px rgba(0,128,0,0.2)",
            }}
          >
            <Zap className="w-5 h-5" />
            <span className="text-lg tracking-tight">E-Charging</span>
          </div>
        </div>

        <Card className="border-zinc-200 shadow-xl shadow-zinc-200/40">
          <CardContent className="p-8">
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
              />
            )}
            {!loading && info?.status === "already_accepted" && (
              <InvalidState
                title="Al geactiveerd"
                message="Deze uitnodiging is al gebruikt om een account aan te maken."
                action={
                  <Button onClick={() => navigate("/login")}>
                    Naar inloggen <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                }
              />
            )}
            {!loading && info?.status === "expired" && (
              <InvalidState
                title="Uitnodiging verlopen"
                message="Deze uitnodiging is niet meer geldig. Neem contact op met E-Charging voor een nieuwe."
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

        <p className="text-center text-xs text-zinc-500 mt-6">
          E-Charging · onderdeel van E-Group BV ·{" "}
          <a href="mailto:info@e-charging.nl" className="text-[#008000] hover:underline">
            info@e-charging.nl
          </a>
        </p>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3 py-4">
      <Skeleton className="h-7 w-2/3 mx-auto" />
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
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="text-center pb-2">
        <h1 className="text-2xl font-semibold text-zinc-900 mb-1">
          Welkom, {info.contact_name || "klant"}
        </h1>
        <p className="text-sm text-zinc-600 leading-relaxed">
          U richt het portaal in voor{" "}
          <span className="font-medium text-zinc-900">{info.company_name}</span>.
          Kies een wachtwoord en u kunt direct aan de slag.
        </p>
      </div>

      <div className="bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-3 text-sm">
        <p className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-1">
          E-mailadres
        </p>
        <p className="text-zinc-900 font-medium">{info.email}</p>
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor="password" className="text-zinc-700 text-sm font-medium">
            Wachtwoord
          </Label>
          <div className="relative mt-1.5">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimaal 8 tekens"
              required
              minLength={8}
              autoComplete="new-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <Label htmlFor="confirm" className="text-zinc-700 text-sm font-medium">
            Wachtwoord bevestigen
          </Label>
          <Input
            id="confirm"
            type={showPassword ? "text" : "password"}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="Herhaal wachtwoord"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1.5"
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={submitting || password.length < 8 || password !== confirmPw}
        className="w-full"
        style={{
          background: submitting ? undefined : "linear-gradient(135deg, #008000 0%, #00a000 100%)",
        }}
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Account aanmaken…
          </>
        ) : (
          <>
            Account activeren
            <CheckCircle className="w-4 h-4 ml-2" />
          </>
        )}
      </Button>

      <p className="text-xs text-zinc-500 text-center pt-2">
        Door verder te gaan accepteert u onze gebruiksvoorwaarden.
      </p>
    </form>
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
    <div className="text-center py-6 space-y-4">
      <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center">
        <AlertCircle className="w-6 h-6 text-amber-600" />
      </div>
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 mb-1.5">{title}</h1>
        <p className="text-sm text-zinc-600 leading-relaxed max-w-sm mx-auto">{message}</p>
      </div>
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
