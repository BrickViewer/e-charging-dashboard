// Pusht de geaggregeerde materiaal-bestelstatus van een installatie-order naar
// de e-portal-planner (Contract 3, zie docs/egroup-integration/README.md).
// Full-state en laatste-wint: elke push stuurt het complete aggregaat, dus een
// gemiste of out-of-order update wordt door de eerstvolgende push volledig
// hersteld. Best-effort: fouten landen in installation_orders.last_sync_error
// en blokkeren nooit de aanroeper.

import { aggregatePreparationStatus, type MaterialStatus } from "./installationHandoff.ts";
import { EgroupApiError, postJson } from "./egroup-api.ts";
import { resolveSecret } from "./secrets.ts";

export interface MaterialSyncResult {
  status: "ok" | "skipped" | "not_configured" | "not_found" | "error";
  preparation_status?: MaterialStatus;
  message?: string;
}

// De sync-endpoint draait op hetzelfde functions-domein als de intake; standaard
// leiden we de URL daaruit af (kan niet driften — beide worden door ons
// gedeployed). Een Vault-override bestaat voor het geval ze ooit uiteenlopen.
// deno-lint-ignore no-explicit-any
async function resolveMaterialSyncUrl(sb: any): Promise<string | null> {
  const override = await resolveSecret(sb, ["EGROUP_MATERIAL_SYNC_URL"], "egroup_material_sync_url");
  if (override) return override;
  const intakeUrl = await resolveSecret(sb, ["EGROUP_INTAKE_URL"], "egroup_intake_url");
  if (!intakeUrl) return null;
  try {
    const u = new URL(intakeUrl);
    const parts = u.pathname.split("/");
    parts[parts.length - 1] = "sync-material-status";
    u.pathname = parts.join("/");
    return u.toString();
  } catch (_) {
    return null;
  }
}

type MaterialRow = {
  position: number | null;
  qty: number | string | null;
  unit: string | null;
  order_number: string | null;
  description: string;
  supplier: string | null;
  status: MaterialStatus;
};

// deno-lint-ignore no-explicit-any
export async function pushMaterialStatusToEportal(sb: any, orderId: string): Promise<MaterialSyncResult> {
  const { data: order } = await sb
    .from("installation_orders")
    .select("id, quote_id, egroup_order_id, materials_expected_at, preparation_notes")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { status: "error", message: "Order niet gevonden" };
  if (!order.egroup_order_id) return { status: "skipped", message: "Order is nog niet overgedragen" };

  const { data: mats, error: matsErr } = await sb
    .from("installation_order_materials")
    .select("position, qty, unit, order_number, description, supplier, status")
    .eq("installation_order_id", orderId)
    .order("position");
  if (matsErr) return { status: "error", message: matsErr.message };
  const rows = (mats ?? []) as MaterialRow[];
  const aggregate = aggregatePreparationStatus(rows.map((m) => m.status));

  // Montage-uren uit de calculatie: vult e-portal order_lines.estimated_hours
  // alleen-als-leeg (planner-correcties winnen); tevens het backfill-pad voor
  // orders die vóór deze uitbreiding zijn overgedragen. 0/geen calc → null.
  let estimatedHours: number | null = null;
  if (order.quote_id) {
    const { data: calc } = await sb
      .from("quote_calculations")
      .select("hours_total")
      .eq("quote_id", order.quote_id)
      .neq("status", "overgeslagen")
      .maybeSingle();
    const h = calc?.hours_total != null ? Number(calc.hours_total) : null;
    estimatedHours = h != null && h > 0 ? h : null;
  }

  const syncUrl = await resolveMaterialSyncUrl(sb);
  const sharedSecret = await resolveSecret(sb, ["EGROUP_SHARED_SECRET"], "egroup_shared_secret");
  if (!syncUrl || !sharedSecret) {
    return { status: "not_configured", message: "E-Group koppeling is nog niet geconfigureerd" };
  }

  try {
    await postJson(
      syncUrl,
      {
        external_reference: orderId,
        preparation_status: aggregate,
        materials_expected_at: order.materials_expected_at ?? null,
        preparation_notes: order.preparation_notes ?? null,
        estimated_hours: estimatedHours,
        // Volledige lijst (alle statussen) — e-portal vervangt order_materials
        // atomair; de werkbon-kopie filtert niet_nodig er zelf uit.
        materials: rows.map((m) => ({
          position: m.position ?? 0,
          qty: Number(m.qty ?? 1),
          unit: m.unit ?? null,
          article_number: m.order_number ?? null, // ons bestelnummer = artikelnummer leverancier
          description: m.description,
          supplier: m.supplier ?? null,
          status: m.status,
        })),
      },
      sharedSecret,
      `material-sync-${orderId}`,
    );
    await sb
      .from("installation_orders")
      .update({ materials_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq("id", orderId);
    return { status: "ok", preparation_status: aggregate };
  } catch (err) {
    const notFound = err instanceof EgroupApiError && err.status === 404;
    const message = notFound
      ? "E-Portal kent deze order niet (404)"
      : err instanceof EgroupApiError
        ? `E-Group ${err.status}: ${err.message}`
        : (err as Error).message;
    await sb
      .from("installation_orders")
      .update({ last_sync_error: `Materiaalsync: ${message}` })
      .eq("id", orderId);
    return { status: notFound ? "not_found" : "error", message };
  }
}
