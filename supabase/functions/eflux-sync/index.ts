import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  RoadApiError,
  clientFromOrg,
  RoadClient,
  RoadEVSEController,
  RoadCPOSession,
  RoadLocation,
  corsHeaders,
} from "./road-api.ts";

// E-Flux/Road sync — view-only.
// Bron-of-truth: Road. Wij lezen, upserten in Supabase, schrijven nooit terug.
// Trigger via cron (30 min) of handmatig via POST naar deze function.
//
// Flow:
//   1. EVSE-controllers ophalen (paginated)
//   2. Distill unieke locationIds → upsert locations (best-effort GET /1/locations/{id})
//   3. Upsert charge_points (location_id via lookup op eflux_location_id)
//   4. CPO sessions ophalen sinds laatste sync-watermark, paginated
//   5. Upsert sessions met client_id afgeleid uit charge_point.location.client_id

const PAGE = 500;
const SESSION_PAGE = 500;

interface SyncSummary {
  fetched: number;
  upserted: number;
  errors: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id, eflux_api_key, eflux_provider_id, eflux_master_account_id")
      .limit(1)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) return json({ status: "error", message: "Organisatie niet gevonden" }, 404);

    const client = clientFromOrg(org);
    if (!client) {
      await logSync(supabase, "config", "failed", 0, "eflux niet geconfigureerd");
      return json({
        status: "not_configured",
        message: "Vul eflux_api_key en eflux_provider_id in via instellingen",
      });
    }

    const accountId = org.eflux_master_account_id ?? undefined;

    // 1. EVSE-controllers + locations + charge_points
    const evseResult = await syncEvsesAndLocations(client, supabase, accountId);

    // 2. Sessions sinds laatste sync
    const sessionResult = await syncSessions(client, supabase, accountId);

    // 3. Reimbursement per sessie (authoritative payout — overschrijft de
    //    voorlopige client_share/net_margin uit stap 2)
    const reimbursementResult = await syncReimbursements(client, supabase);

    return json({
      status: "ok",
      startedAt,
      finishedAt: new Date().toISOString(),
      locations: evseResult.locations,
      chargePoints: evseResult.chargePoints,
      sessions: sessionResult,
      reimbursements: reimbursementResult,
    });
  } catch (err) {
    if (err instanceof RoadApiError) {
      await logSync(supabase, "sync", "failed", 0, `Road ${err.status}: ${err.message}`);
      return json({ status: "road_error", statusCode: err.status, message: err.message });
    }
    const msg = (err as Error).message ?? "Onbekende fout";
    await logSync(supabase, "sync", "failed", 0, msg);
    return json({ status: "error", message: msg }, 500);
  }
});

// =====================================================================
// EVSE + Locations + Charge Points
// =====================================================================

async function syncEvsesAndLocations(
  client: RoadClient,
  supabase: any,
  accountId?: string,
): Promise<{ locations: SyncSummary; chargePoints: SyncSummary }> {
  const locSummary: SyncSummary = { fetched: 0, upserted: 0, errors: 0 };
  const cpSummary: SyncSummary = { fetched: 0, upserted: 0, errors: 0 };

  // 1.1 — paginated fetch alle EVSEs
  const allEvses: RoadEVSEController[] = [];
  let skip = 0;
  while (true) {
    const result = await client.searchEvseControllers({
      accountId,
      limit: PAGE,
      skip,
    });
    allEvses.push(...result.data);
    if (result.data.length < PAGE) break;
    skip += PAGE;
    if (skip > 50_000) break; // safety circuit
  }
  cpSummary.fetched = allEvses.length;

  // 1.2 — distill unieke locationIds
  const locationIds = [...new Set(allEvses.map((e) => e.locationId).filter(Boolean))];
  locSummary.fetched = locationIds.length;

  // 1.3 — best-effort fetch location details (kan 404 geven)
  for (const locId of locationIds) {
    let detail: RoadLocation | null = null;
    try {
      detail = await client.getLocation(locId);
    } catch (err) {
      // 404 of andere fout: gebruik fallback met alleen het ID
      if (!(err instanceof RoadApiError && err.status === 404)) {
        console.warn(`getLocation ${locId} failed:`, (err as Error).message);
      }
    }

    const locationRow = mapRoadLocationToRow(locId, detail);

    // Upsert op eflux_location_id — bewaar bestaande client_id (NIET overschrijven)
    const { error } = await supabase
      .from("locations")
      .upsert(locationRow, { onConflict: "eflux_location_id", ignoreDuplicates: false });

    if (error) {
      console.error("upsert location failed:", error.message, locationRow);
      locSummary.errors++;
    } else {
      locSummary.upserted++;
    }
  }

  // 1.4 — fetch our internal location ID per eflux_location_id (lookup map)
  const locMap = new Map<string, string>(); // eflux_location_id → our id
  if (locationIds.length > 0) {
    const { data: locs, error } = await supabase
      .from("locations")
      .select("id, eflux_location_id")
      .in("eflux_location_id", locationIds);
    if (error) throw error;
    for (const l of locs ?? []) {
      if (l.eflux_location_id) locMap.set(l.eflux_location_id, l.id);
    }
  }

  // 1.5 — upsert charge_points
  for (const evse of allEvses) {
    const internalLocId = locMap.get(evse.locationId);
    if (!internalLocId) {
      console.warn(`evse ${evse.id} has unknown location ${evse.locationId}, skip`);
      cpSummary.errors++;
      continue;
    }

    const cpRow = mapRoadEvseToRow(evse, internalLocId);

    const { error } = await supabase
      .from("charge_points")
      .upsert(cpRow, { onConflict: "eflux_evse_controller_id", ignoreDuplicates: false });

    if (error) {
      console.error("upsert charge_point failed:", error.message, cpRow);
      cpSummary.errors++;
    } else {
      cpSummary.upserted++;
    }
  }

  await logSync(supabase, "locations", "success", locSummary.upserted);
  await logSync(supabase, "charge_points", "success", cpSummary.upserted);

  return { locations: locSummary, chargePoints: cpSummary };
}

function mapRoadLocationToRow(eflux_location_id: string, detail: RoadLocation | null) {
  if (!detail) {
    return {
      eflux_location_id,
      // name is een placeholder — wordt later overschreven als detail wel beschikbaar komt
      name: `Locatie ${eflux_location_id.slice(0, 8)}`,
    };
  }

  const street = detail.street ?? detail.address ?? "";
  const number = detail.houseNumber ?? "";
  const fullAddress = [street, number].filter(Boolean).join(" ").trim() || detail.address || null;

  return {
    eflux_location_id,
    name: detail.name ?? fullAddress ?? `Locatie ${eflux_location_id.slice(0, 8)}`,
    address: fullAddress,
    city: detail.city ?? null,
    postal_code: detail.postalCode ?? null,
    latitude: detail.coordinates?.latitude ?? detail.latitude ?? null,
    longitude: detail.coordinates?.longitude ?? detail.longitude ?? null,
  };
}

function mapRoadEvseToRow(evse: RoadEVSEController, internalLocationId: string) {
  const firstConnector = evse.connectors?.[0];
  const powerType = firstConnector?.powerType ?? "";
  const isDcType = /DC/i.test(powerType);
  const internalType = isDcType ? "dc" : (evse.maxPower && evse.maxPower >= 22 ? "ac_22" : "ac_11");

  // Map connectivityState naar onze status enum (online/offline/in_use/error)
  let status: string = "offline";
  if (evse.isDisabled) status = "offline";
  else if (evse.connectivityState === "connected") status = "online";
  else if (evse.connectivityState === "maybe-connected") status = "online";
  else if (evse.connectivityState === "disconnected") status = "offline";
  else if (evse.connectivityState === "access-denied") status = "error";
  else if (evse.connectivityState === "pending-first-connection") status = "installation_pending";

  // Bepaal "current" prijs per kWh — pak de eerste connector's tarief
  const currentPriceFromCs = evse.costSettings?.[0]?.pricePerKwh;

  return {
    location_id: internalLocationId,
    eflux_evse_controller_id: evse.id,
    eflux_evse_id: evse.evseId ?? null,
    evse_id_global: evse.evseId ?? null,
    name: evse.name ?? evse.ocppIdentity ?? evse.serialNumber ?? `EVSE ${evse.id.slice(0, 8)}`,
    serial_number: evse.serialNumber ?? null,
    brand: evse.vendorName ?? null,
    model: evse.modelNumber ?? null,
    type: internalType,
    status,
    connectivity_state: evse.connectivityState ?? "unknown",
    last_heartbeat_at: evse.heartbeatReceivedAt ?? null,
    num_connectors: evse.numConnectors ?? evse.connectors?.length ?? 1,
    max_power: evse.maxPower ?? null,
    cost_settings: evse.costSettings ?? null,
    current_price_per_kwh: currentPriceFromCs ?? null,
    tariff_profile_id: evse.tariffProfileId ?? null,
    operational_status: evse.evseOperationalStatus?.canonicalStatus ?? null,
    firmware_version: evse.firmwareVersion ?? null,
    is_disabled: evse.isDisabled ?? false,
  };
}

// =====================================================================
// Sessions
// =====================================================================

async function syncSessions(
  client: RoadClient,
  supabase: any,
  accountId?: string,
): Promise<SyncSummary> {
  const summary: SyncSummary = { fetched: 0, upserted: 0, errors: 0 };

  const lastSyncAt = await getLastSync(supabase, "cpo_sessions");

  // Charge_point lookup: eflux_evse_controller_id → { id, location_id, location.client_id }
  const cpMap = new Map<string, { cp_id: string; location_id: string; client_id: string | null }>();
  {
    const { data, error } = await supabase
      .from("charge_points")
      .select("id, location_id, eflux_evse_controller_id, locations!inner(client_id)");
    if (error) throw error;
    for (const cp of data ?? []) {
      if (cp.eflux_evse_controller_id) {
        cpMap.set(cp.eflux_evse_controller_id, {
          cp_id: cp.id,
          location_id: cp.location_id,
          client_id: (cp as any).locations?.client_id ?? null,
        });
      }
    }
  }

  // Paginated fetch sessions sinds last sync
  let skip = 0;
  let totalFetched = 0;
  while (true) {
    const params: any = {
      accountId,
      limit: SESSION_PAGE,
      skip,
    };
    if (lastSyncAt) {
      params.updatedAt = { $gte: lastSyncAt };
    }
    const result = await client.searchCpoSessions(params);
    if (result.data.length === 0) break;
    totalFetched += result.data.length;
    summary.fetched = totalFetched;

    const rows = [];
    for (const s of result.data) {
      const cpInfo = cpMap.get(s.evseControllerId);
      if (!cpInfo) {
        // Sessie van onbekende EVSE — skippen, sync EVSEs eerst
        continue;
      }

      rows.push(mapRoadSessionToRow(s, cpInfo));
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from("charging_sessions")
        .upsert(rows, { onConflict: "eflux_session_id", ignoreDuplicates: false });

      if (error) {
        console.error("upsert sessions batch failed:", error.message);
        summary.errors += rows.length;
      } else {
        summary.upserted += rows.length;
      }
    }

    if (result.data.length < SESSION_PAGE) break;
    skip += SESSION_PAGE;
    if (skip > 100_000) break; // safety circuit
  }

  await logSync(supabase, "cpo_sessions", "success", summary.upserted);
  return summary;
}

function mapRoadSessionToRow(
  s: RoadCPOSession,
  cpInfo: { cp_id: string; location_id: string; client_id: string | null },
) {
  const energyCost = Number(s.energyCosts ?? 0);
  const totalPrice = Number(s.totalPrice ?? 0);

  // Voorlopige client_share-schatting; wordt later overschreven door reimbursement-call
  // (zie syncReimbursementsForRecentSessions). Dit is alleen een fallback voor net-aangekomen sessies.
  const provisionalNet = totalPrice - energyCost;

  return {
    charge_point_id: cpInfo.cp_id,
    location_id: cpInfo.location_id,
    client_id: cpInfo.client_id,
    eflux_session_id: s.id,
    started_at: s.startedAt,
    ended_at: s.endedAt ?? null,
    duration_minutes: s.durationSeconds ? Math.round(s.durationSeconds / 60) : null,
    duration_seconds: s.durationSeconds ?? null,
    kwh_delivered: s.kwh ?? 0,
    gross_revenue: totalPrice,
    energy_cost: energyCost,
    energy_costs: energyCost,
    time_costs: s.timeCosts ?? 0,
    start_costs: s.startCosts ?? 0,
    idle_costs: s.idleCosts ?? 0,
    total_price: totalPrice,
    net_margin: provisionalNet,
    client_share: provisionalNet * 0.75,
    echarging_share: provisionalNet * 0.25,
    status: s.status ?? "COMPLETED",
    power_type: s.powerType ?? null,
    connector_id: s.connectorId ?? null,
    excluded: s.excluded ?? false,
    currency: s.currency ?? "EUR",
    token_party_id: s.tokenInfraProviderId ?? null,
    token_uid: s.tokenUid ?? null,
    token_issuer_name: s.tokenIssuerName ?? null,
    payment_flow: s.paymentFlow ?? null,
    is_roaming: s.isRoaming ?? false,
  };
}

// =====================================================================
// Reimbursements — authoritative payout per session
// =====================================================================

const REIMB_BATCH = 50; // max sessies per sync-run om Road-rate-limits te respecteren

async function syncReimbursements(
  client: RoadClient,
  supabase: any,
): Promise<SyncSummary> {
  const summary: SyncSummary = { fetched: 0, upserted: 0, errors: 0 };

  // Pak sessies die wél in onze DB staan, completed zijn, en nog geen
  // reimbursement-data hebben gekregen. Beperk tot REIMB_BATCH per run
  // zodat één sync-cyclus niet rate-limited wordt op N+1 calls.
  const { data: pending, error } = await supabase
    .from("charging_sessions")
    .select("id, eflux_session_id, client_id, kwh_delivered")
    .not("eflux_session_id", "is", null)
    .is("reimbursement_synced_at", null)
    .eq("status", "COMPLETED")
    .order("started_at", { ascending: false })
    .limit(REIMB_BATCH);

  if (error) throw error;
  if (!pending || pending.length === 0) {
    await logSync(supabase, "reimbursements", "success", 0);
    return summary;
  }

  summary.fetched = pending.length;

  for (const sess of pending) {
    try {
      const reimb = await client.getReimbursements(sess.eflux_session_id!);
      const total = Number(reimb.total ?? 0);

      // 75/25 verdeling toepassen op authoritative bedrag
      const clientShare = total * 0.75;
      const echargingShare = total * 0.25;

      const { error: upErr } = await supabase
        .from("charging_sessions")
        .update({
          reimbursement_amount: total,
          net_margin: total,
          client_share: clientShare,
          echarging_share: echargingShare,
          reimbursement_synced_at: new Date().toISOString(),
        })
        .eq("id", sess.id);

      if (upErr) {
        console.error(`update reimbursement for ${sess.id} failed:`, upErr.message);
        summary.errors++;
      } else {
        summary.upserted++;
      }
    } catch (err) {
      // 404 of andere fout — markeer als "geprobeerd" door synced_at te zetten,
      // anders blijft elke run dezelfde sessie opnieuw proberen.
      if (err instanceof RoadApiError && err.status === 404) {
        await supabase
          .from("charging_sessions")
          .update({ reimbursement_synced_at: new Date().toISOString() })
          .eq("id", sess.id);
        summary.errors++;
      } else {
        console.error(`reimbursement fetch ${sess.eflux_session_id} failed:`, (err as Error).message);
        summary.errors++;
        // Blijft retry-eligible bij volgende sync
      }
    }
  }

  await logSync(supabase, "reimbursements", "success", summary.upserted);
  return summary;
}

// =====================================================================
// Helpers
// =====================================================================

async function getLastSync(supabase: any, entityType: string): Promise<string | null> {
  const { data } = await supabase
    .from("eflux_sync_log")
    .select("last_synced_at")
    .eq("entity_type", entityType)
    .eq("status", "success")
    .order("last_synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.last_synced_at ?? null;
}

async function logSync(
  supabase: any,
  entityType: string,
  status: "running" | "success" | "failed" | "pending",
  recordsSynced: number,
  errorMessage?: string,
) {
  await supabase.from("eflux_sync_log").insert({
    entity_type: entityType,
    status,
    records_synced: recordsSynced,
    last_synced_at: status === "success" ? new Date().toISOString() : null,
    error_message: errorMessage ?? null,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
