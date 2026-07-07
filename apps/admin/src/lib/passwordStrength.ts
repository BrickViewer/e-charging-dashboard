// Gedeelde wachtwoordsterkte-logica (zxcvbn) voor álle plekken waar een klant of teamlid
// een wachtwoord kiest: account activeren (InviteAccept), herstellen (ResetPassword) en
// wijzigen (CompanyDetailsForm). Zo gelden overal dezelfde eisen.
//
// De zxcvbn-woordenboeken (een paar honderd KB) worden LAZY via dynamische import() geladen,
// zodat ze alleen op wachtwoordschermen in een aparte chunk landen en de portaal-bundel licht blijft.

export const PASSWORD_MIN_LENGTH = 10;
// zxcvbn-score 0-4; 3 = "veilig onraadbaar". Onder 3 blokkeren we opslaan.
export const PASSWORD_MIN_SCORE = 3;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordEvaluation {
  score: PasswordScore;
  ok: boolean;
  labelNl: string;
  warningNl?: string;
}

const SCORE_LABELS_NL: Record<PasswordScore, string> = {
  0: "Zeer zwak",
  1: "Zwak",
  2: "Redelijk",
  3: "Sterk",
  4: "Zeer sterk",
};

type ZxcvbnResult = { score: number };
type ZxcvbnInstance = { check: (password: string, userInputs?: (string | number)[]) => ZxcvbnResult };
type ZxcvbnFactoryCtor = new (options: Record<string, unknown>) => ZxcvbnInstance;
type ZxcvbnFn = (password: string, userInputs?: (string | number)[]) => ZxcvbnResult;

// Leest een export uit de module-namespace, ongeacht ESM (named export) of CJS (onder `.default`).
function pick<T>(mod: unknown, key: string): T {
  const m = mod as Record<string, unknown> & { default?: Record<string, unknown> };
  return (m[key] ?? m.default?.[key]) as T;
}

let loader: Promise<ZxcvbnFn> | null = null;

// Eénmalig de core + woordenboeken laden en de zxcvbn-factory bouwen (gememoïseerd).
async function ensureLoaded(): Promise<ZxcvbnFn> {
  if (!loader) {
    loader = (async () => {
      const [coreMod, commonMod, enMod] = await Promise.all([
        import("@zxcvbn-ts/core"),
        import("@zxcvbn-ts/language-common"),
        import("@zxcvbn-ts/language-en"),
      ]);
      const ZxcvbnFactory = pick<ZxcvbnFactoryCtor>(coreMod, "ZxcvbnFactory");
      const factory = new ZxcvbnFactory({
        dictionary: {
          ...pick<Record<string, unknown>>(commonMod, "dictionary"),
          ...pick<Record<string, unknown>>(enMod, "dictionary"),
        },
        graphs: pick<Record<string, unknown>>(commonMod, "adjacencyGraphs"),
        translations: pick<Record<string, unknown>>(enMod, "translations"),
      });
      return (password: string, userInputs?: (string | number)[]) => factory.check(password, userInputs);
    })();
  }
  return loader;
}

// Beoordeelt een wachtwoord. `userInputs` (e-mail, bedrijfsnaam, contactnaam) laten zxcvbn
// wachtwoorden die daarop lijken zwaar afstraffen.
export async function evaluatePassword(
  password: string,
  userInputs: (string | number)[] = [],
): Promise<PasswordEvaluation> {
  if (!password) {
    return { score: 0, ok: false, labelNl: "" };
  }
  const zxcvbn = await ensureLoaded();
  const inputs = userInputs.map((v) => String(v)).filter((s) => s.length > 0);
  const raw = zxcvbn(password, inputs).score;
  const score = Math.max(0, Math.min(4, raw)) as PasswordScore;
  const longEnough = password.length >= PASSWORD_MIN_LENGTH;
  const ok = longEnough && score >= PASSWORD_MIN_SCORE;
  const warningNl = !longEnough
    ? `Gebruik minimaal ${PASSWORD_MIN_LENGTH} tekens.`
    : score < PASSWORD_MIN_SCORE
      ? "Kies een minder voorspelbaar wachtwoord — combineer woorden, cijfers en tekens."
      : undefined;
  return { score, ok, labelNl: SCORE_LABELS_NL[score], warningNl };
}
