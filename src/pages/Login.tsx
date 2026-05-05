import { useState, useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Power, Loader2 } from "lucide-react";
import { CockpitArc } from "@/components/portal/CockpitArc";
import logoBright from "@/assets/icon-bright.svg";

type Phase = "idle" | "submitting" | "ignition" | "ready" | "error";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [errMsg, setErrMsg] = useState("");
  const [showPw, setShowPw] = useState(false);

  const { signIn, user, role, isLoading, isInternal } = useAuth();
  const navigate = useNavigate();

  if (!isLoading && user && role && phase !== "ignition" && phase !== "ready") {
    if (isInternal) return <Navigate to="/admin" replace />;
    if (role === "client") return <Navigate to="/portal" replace />;
  }

  // Bij ignition: na 2.6s pulseringssequentie redirect uitvoeren
  useEffect(() => {
    if (phase === "ignition" && user && role) {
      const timer = setTimeout(() => {
        setPhase("ready");
        setTimeout(() => {
          if (isInternal) navigate("/admin");
          else if (role === "client") navigate("/portal");
          else navigate("/");
        }, 400);
      }, 2400);
      return () => clearTimeout(timer);
    }
  }, [phase, user, role, isInternal, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg("");
    setPhase("submitting");
    const { error } = await signIn(email, password);
    if (error) {
      setErrMsg("Ongeldige inloggegevens");
      setPhase("error");
      return;
    }
    setPhase("ignition");
  };

  return (
    <div className="portal-theme relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Cockpit-kap bovenaan */}
      <div className="absolute top-0 left-0 right-0 pointer-events-none">
        <CockpitArc className="h-[clamp(120px,22vh,320px)]" />
      </div>

      {/* Ambient grid + scan lines achtergrond */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, hsl(200 100% 64% / 0.08) 0%, transparent 40%), radial-gradient(circle at 80% 70%, hsl(120 100% 50% / 0.06) 0%, transparent 45%)",
          }}
        />
      </div>

      {/* Scrolling scan-line — alleen actief tijdens ignition */}
      {phase === "ignition" && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="ignition-scan absolute inset-x-0 h-1" />
        </div>
      )}

      {/* Centrale gauge-cluster decoratie + form */}
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-20">
        {phase === "ignition" || phase === "ready" ? (
          <IgnitionSequence label={role === "client" ? "WELKOM" : "BEHEER"} />
        ) : (
          <LoginForm
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            showPw={showPw}
            setShowPw={setShowPw}
            phase={phase}
            errMsg={errMsg}
            onSubmit={handleSubmit}
          />
        )}

        <p className="absolute bottom-6 inset-x-0 text-center text-[10px] uppercase tracking-[0.4em] text-muted-foreground/60 select-none">
          E-Charging · onderdeel van E-Group BV
        </p>
      </div>

      {/* Animation styles inline */}
      <style>{loginStyles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function LoginForm(props: {
  email: string;
  setEmail: (s: string) => void;
  password: string;
  setPassword: (s: string) => void;
  showPw: boolean;
  setShowPw: (b: boolean) => void;
  phase: Phase;
  errMsg: string;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const { email, setEmail, password, setPassword, showPw, setShowPw, phase, errMsg, onSubmit } = props;
  const submitting = phase === "submitting";

  return (
    <div className="w-full max-w-[420px] animate-fade-in">
      {/* Logo + branding */}
      <div className="flex flex-col items-center mb-10">
        <div className="relative">
          <div className="absolute -inset-3 rounded-2xl bg-gradient-to-br from-primary/30 via-blue-400/10 to-transparent blur-xl pointer-events-none" />
          <div className="relative bg-gradient-to-br from-card to-card/40 border border-border rounded-2xl p-3 backdrop-blur-sm">
            <img src={logoBright} alt="E-Charging" className="h-10 w-auto" />
          </div>
        </div>
        <p className="cockpit-title mt-6">Inloggen</p>
        <div className="cockpit-title-accent mt-2" />
      </div>

      {/* Login card — cockpit-stijl */}
      <div className="relative">
        <div className="absolute -inset-px rounded-3xl bg-gradient-to-br from-primary/30 via-transparent to-blue-400/20 pointer-events-none" />
        <form
          onSubmit={onSubmit}
          className="relative portal-card rounded-3xl bg-card/80 backdrop-blur-md p-7 space-y-5 border-border/60"
          style={{ boxShadow: "0 0 60px rgba(0,128,0,0.06), 0 1px 0 rgba(255,255,255,0.04) inset" }}
        >
          <div>
            <Label htmlFor="email" className="cockpit-section-label">
              E-mailadres
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="uw@email.nl"
              required
              autoComplete="email"
              disabled={submitting}
              className="mt-2 h-11 bg-background/60 border-border focus-visible:ring-primary/50 focus-visible:ring-offset-0"
            />
          </div>

          <div>
            <Label htmlFor="password" className="cockpit-section-label">
              Wachtwoord
            </Label>
            <div className="relative mt-2">
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                disabled={submitting}
                className="h-11 pr-11 bg-background/60 border-border focus-visible:ring-primary/50 focus-visible:ring-offset-0"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {errMsg && (
            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
              {errMsg}
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="ignition-button w-full h-12 text-sm font-semibold tracking-[0.18em] uppercase mt-1 relative overflow-hidden"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Inloggen…
              </>
            ) : (
              <>
                <Power className="w-4 h-4 mr-2" />
                Inloggen
              </>
            )}
          </Button>

          <p className="text-[10px] text-center text-muted-foreground/70 tracking-widest uppercase pt-2">
            Authentication via Supabase · TLS 1.3
          </p>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ignition: 3 gauges sweep, daarna "Welkom" overlay

function IgnitionSequence({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-10 animate-ignition-fade">
      <div className="flex items-center gap-8 sm:gap-14">
        <SweepGauge color="hsl(var(--gauge-red))" delay="0ms" />
        <SweepGauge color="hsl(var(--gauge-blue))" delay="120ms" big />
        <SweepGauge color="hsl(var(--gauge-green))" delay="240ms" />
      </div>

      <div className="text-center">
        <p className="cockpit-title text-foreground">{label}</p>
        <div className="cockpit-title-accent mx-auto mt-3" />
        <p className="text-xs text-muted-foreground tracking-[0.4em] uppercase mt-4 animate-pulse">
          Live data wordt geladen
        </p>
      </div>
    </div>
  );
}

function SweepGauge({ color, delay, big = false }: { color: string; delay: string; big?: boolean }) {
  const r = big ? 80 : 56;
  const size = big ? 200 : 140;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = big ? 5 : 3.5;

  const startAngle = -135;
  const endAngle = 135;

  const trackPath = describeArc(cx, cy, startAngle, endAngle, r);

  return (
    <div className="relative" style={{ width: size, height: size, animation: `gauge-pop 600ms ${delay} backwards`, animationTimingFunction: "cubic-bezier(0.34, 1.6, 0.64, 1)" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <defs>
          <filter id={`glow-${delay}`}>
            <feGaussianBlur stdDeviation={big ? 6 : 4} />
          </filter>
        </defs>

        {/* Track */}
        <path d={trackPath} fill="none" stroke="hsl(var(--gauge-track))" strokeWidth={stroke} strokeLinecap="round" />

        {/* Animated active arc */}
        <path
          d={trackPath}
          fill="none"
          stroke={color}
          strokeWidth={stroke + 1}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          style={{
            strokeDashoffset: 1,
            animation: `sweep 1400ms ${delay} cubic-bezier(0.34, 1.1, 0.64, 1) forwards, gauge-glow 1800ms ${delay} ease-out forwards`,
            filter: `drop-shadow(0 0 8px ${color})`,
          }}
        />

        {/* Inner pulse */}
        <circle
          cx={cx}
          cy={cy}
          r={big ? 6 : 4}
          fill={color}
          style={{
            animation: `pulse-dot 800ms ${delay} ease-in forwards`,
            filter: `drop-shadow(0 0 12px ${color})`,
          }}
        />
      </svg>
    </div>
  );
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, startAngle: number, endAngle: number, r: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline styling — animations + button glow

const loginStyles = `
@keyframes sweep {
  to { stroke-dashoffset: 0; }
}
@keyframes gauge-glow {
  0% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0.8; }
}
@keyframes gauge-pop {
  0% { opacity: 0; transform: scale(0.6); }
  60% { opacity: 1; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes pulse-dot {
  0% { opacity: 0; transform: scale(0); transform-origin: center; }
  100% { opacity: 1; transform: scale(1); transform-origin: center; }
}
@keyframes ignition-fade {
  0% { opacity: 0; transform: translateY(8px); }
  100% { opacity: 1; transform: translateY(0); }
}
.animate-ignition-fade {
  animation: ignition-fade 400ms ease-out backwards;
}

@keyframes ignition-scan {
  0%   { top: 0;    opacity: 0; }
  10%  { opacity: 1; }
  90%  { opacity: 1; }
  100% { top: 100%; opacity: 0; }
}
.ignition-scan {
  background: linear-gradient(90deg, transparent, hsl(var(--gauge-blue) / 0.6), transparent);
  box-shadow: 0 0 20px hsl(var(--gauge-blue) / 0.4);
  animation: ignition-scan 2400ms ease-out forwards;
}

/* Ignition-button — energetic gradient + glow op hover */
.ignition-button {
  background: linear-gradient(135deg, hsl(120 100% 25%) 0%, hsl(140 100% 32%) 100%);
  color: white;
  box-shadow: 0 0 0 1px hsl(120 100% 35% / 0.4), 0 8px 24px hsl(120 100% 25% / 0.3);
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
.ignition-button:hover:not(:disabled) {
  background: linear-gradient(135deg, hsl(120 100% 28%) 0%, hsl(140 100% 35%) 100%);
  box-shadow: 0 0 0 1px hsl(120 100% 50% / 0.6), 0 12px 36px hsl(120 100% 30% / 0.45);
  transform: translateY(-1px);
}
.ignition-button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 0 0 1px hsl(120 100% 35% / 0.4), 0 4px 12px hsl(120 100% 25% / 0.3);
}
.ignition-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
`;
