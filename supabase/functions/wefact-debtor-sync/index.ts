import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import { CORS_STD } from "../_shared/cors.ts";
import { resolveSecret } from "../_shared/secrets.ts";
import { WefactClient, WefactError } from "../_shared/wefact.ts";
import { Anchor, buildDebtorParams, resolveAnchor, writeDebtorRef } from "../_shared/wefactSubjects.ts";

// Beheert de WeFact-debiteur voor een contact/klant:
//   action=search  -> zoek bestaande WeFact-debiteuren (koppel-picker)
//   action=create  -> maak/werk-bij en schrijf de refs terug op company/person
//   action=link    -> koppel een bestaande DebtorCode aan company/person
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_STD });
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = await requireAdminOrInternal(req, supabase, CORS_STD, { allowInternal: false });
    if (!auth.ok) return auth.response;

    const apiKey = await resolveSecret(supabase, ["WEFACT_API_KEY"], "wefact_api_key");
    if (!apiKey) return json({ status: "not_configured", message: "WeFact API-key ontbreekt" });
    const client = new WefactClient(apiKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "search") {
      const term = String(body.term ?? "").trim();
      const res = await client.debtorList({ searchfor: term, limit: 25 });
      const debtors = Array.isArray(res.debtors) ? res.debtors : [];
      return json({
        status: "ok",
        debtors: debtors.map((d: Record<string, unknown>) => ({
          Identifier: String(d.Identifier ?? ""),
          DebtorCode: String(d.DebtorCode ?? ""),
          CompanyName: String(d.CompanyName ?? ""),
          SurName: String(d.SurName ?? ""),
          EmailAddress: String(d.EmailAddress ?? ""),
        })),
      });
    }

    const subjectType = String(body.subjectType ?? "");
    const subjectId = String(body.subjectId ?? "");
    if (!subjectType || !subjectId) return json({ status: "error", message: "subjectType en subjectId zijn verplicht" }, 400);
    const anchor = await resolveAnchor(supabase, subjectType, subjectId);

    if (action === "link") {
      const debtorCode = String(body.debtorCode ?? "").trim();
      if (!debtorCode) return json({ status: "error", message: "debtorCode is verplicht" }, 400);
      const res = await client.debtorShow({ DebtorCode: debtorCode });
      const debtor = res.debtor ?? {};
      if (!debtor?.Identifier) return json({ status: "error", message: `Debiteur ${debtorCode} niet gevonden in WeFact` }, 404);
      await writeDebtorRef(supabase, anchor, String(debtor.Identifier), String(debtor.DebtorCode ?? debtorCode));
      return json({ status: "ok", debtorCode: String(debtor.DebtorCode ?? debtorCode), debtorId: String(debtor.Identifier) });
    }

    if (action === "create") {
      const { data: org } = await supabase.from("organizations").select("wefact_debtor_group_id").limit(1).maybeSingle();
      const params = await buildDebtorParams(supabase, anchor, { debtorGroupId: org?.wefact_debtor_group_id ?? null });

      const existingCode = anchor.row.wefact_debtor_code as string | null;
      let debtor: Record<string, unknown>;
      if (existingCode) {
        const res = await client.debtorEdit({ DebtorCode: existingCode, ...params });
        debtor = res.debtor ?? { DebtorCode: existingCode, Identifier: anchor.row.wefact_debtor_id };
      } else {
        const res = await client.debtorAdd(params);
        debtor = res.debtor ?? {};
      }
      if (!debtor?.Identifier && !existingCode) {
        return json({ status: "error", message: "WeFact gaf geen debiteur terug" }, 502);
      }
      const debtorId = String(debtor.Identifier ?? anchor.row.wefact_debtor_id ?? "");
      const debtorCode = String(debtor.DebtorCode ?? existingCode ?? "");
      await writeDebtorRef(supabase, anchor, debtorId, debtorCode);
      return json({ status: "ok", debtorId, debtorCode, anchor: anchorInfo(anchor) });
    }

    return json({ status: "error", message: `Onbekende action: ${action}` }, 400);
  } catch (err) {
    if (err instanceof WefactError) {
      return json({ status: "wefact_error", statusCode: err.status, message: err.message, errors: err.errors });
    }
    return json({ status: "error", message: (err as Error).message ?? "Onbekende fout" }, 500);
  }
});

function anchorInfo(a: Anchor) {
  return { table: a.table, id: a.id };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_STD, "Content-Type": "application/json" } });
}
