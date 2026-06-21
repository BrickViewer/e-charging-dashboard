import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { requireAdminOrInternal } from "../_shared/auth.ts";
import {
  RoadApiError,
  clientFromEnvAndOrg,
  RoadClient,
  RoadEVSEController,
  RoadCPOSession,
  RoadLocation,
  RoadInvoice,
  corsHeaders,
} from "./road-api.ts";
import { classifyFault } from "./faults.ts";

// Open storing-statussen (storing is nog niet afgesloten).
const OPEN_FAULT_STATUSES = ["nieuw", "eflux_gemeld", "klant_gecontacteerd", "bezoek_ingepland"];

interface OrgRow {
  id: string;
  eflux_provider_id?: string | null;
  eflux_master_account_id?: string | null;
  fault_detection_enabled?: boolean | null;
}

type SupabaseClient = ReturnType<typeof createClient>;

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

const PAGE = 100;
const SESSION_PAGE = 100;

interface SyncSummary {
  fetched: number;
  upserted: number;
  errors: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ status: "error", message: "Method not allowed" }, 405);

  const startedAt = new Date().toISOString();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    const auth = await requireAdminOrInternal(req, supabase, corsHeaders);
    if (!auth.ok) return auth.response;

    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("id, eflux_provider_id, eflux_master_account_id, fault_detection_enabled")
      .limit(1)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) return json({ status: "error", message: "Organisatie niet gevonden" }, 404);

    const client = clientFromEnvAndOrg(org);
    if (!client) {
      await logSync(supabase, "config", "failed", 0, "eflux niet geconfigureerd");
      return json({
        status: "not_configured",
        message: "EFLUX_API_KEY ontbreekt in Supabase secrets of eflux_provider_id is leeg in de instellingen",
      });
    }

    const accountId = org.eflux_master_account_id ?? undefined;

    // 1. EVSE-controllers + locations + charge_points (incl. storingsdetectie)
    const evseResult = await syncEvsesAndLocations(client, supabase, accountId, org as OrgRow);

    // 2. Sessions sinds laatste sync (inclusief reimbursement_amount + client_share
    //    via priceWithFX.originalReimbursementAmount — geen aparte call meer nodig)
    const sessionResult = await syncSessions(client, supabase, accountId);

    // 3. Invoices (self-billing facturen van Road aan E-Group BV)
    const invoiceResult = await syncInvoices(client, supabase);

    // 4. Trigger aggregate-settlements voor huidig + vorig kwartaal.
    //    Best-effort: failures breken de sync-response niet.
    let aggregateResult: unknown = null;
    try {
      aggregateResult = await invokeAggregateSettlements({});
    } catch (e) {
      console.warn("aggregate-settlements chain failed:", (e as Error).message);
      aggregateResult = { error: (e as Error).message };
    }

    return json({
      status: "ok",
      startedAt,
      finishedAt: new Date().toISOString(),
      locations: evseResult.locations,
      chargePoints: evseResult.chargePoints,
      sessions: sessionResult,
      invoices: invoiceResult,
      aggregate: aggregateResult,
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

async function invokeAggregateSettlements(body: Record<string, unknown>) {
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  if (!internalSecret) throw new Error("INTERNAL_FUNCTION_SECRET ontbreekt");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL ontbreekt");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-internal-secret": internalSecret,
  };
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (anonKey) headers.apikey = anonKey;

  const res = await fetch(`${supabaseUrl}/functions/v1/aggregate-settlements`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let payload: unknown = null;
  try { payload = text ? JSON.parse(text) : null; } catch (_) { payload = text; }

  if (!res.ok) {
    const message = typeof payload === "object" && payload && "message" in payload
      ? String((payload as { message?: unknown }).message)
      : `aggregate-settlements returned ${res.status}`;
    throw new Error(message);
  }

  return { triggered: true, response: payload };
}

// =====================================================================
// EVSE + Locations + Charge Points
// =====================================================================

async function syncEvsesAndLocations(
  client: RoadClient,
  supabase: SupabaseClient,
  accountId?: string,
  org?: OrgRow,
): Promise<{ locations: SyncSummary; chargePoints: SyncSummary }> {
  const locSummary: SyncSummary = { fetched: 0, upserted: 0, errors: 0 };
  const cpSummary: SyncSummary = { fetched: 0, upserted: 0, errors: 0 };

  // 1.1 — paginated fetch alle EVSEs (search/fast — beknopte response, zonder costSettings)
  const searchResult: RoadEVSEController[] = [];
  let skip = 0;
  while (true) {
    const result = await client.searchEvseControllers({
      accountId,
      limit: PAGE,
      skip,
    });
    searchResult.push(...result.data);
    if (result.data.length < PAGE) break;
    skip += PAGE;
    if (skip > 50_000) break; // safety circuit
  }
  cpSummary.fetched = searchResult.length;

  // 1.1b — Verrijk elke EVSE met costSettings via GET singular.
  //         Road's search/fast laat costSettings + tariffProfileId weg; voor tarief-display
  //         per paal moeten we het detail-endpoint aanroepen.
  const allEvses: RoadEVSEController[] = [];
  for (const stub of searchResult) {
    try {
      const detail = await client.getEvseController(stub.id);
      // Merge: stub heeft connectivity-info, detail heeft costSettings
      allEvses.push({ ...stub, ...detail });
    } catch (err) {
      console.warn(`getEvseController ${stub.id} failed:`, (err as Error).message);
      allEvses.push(stub); // fallback: gebruik stub zonder costSettings
    }
  }

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

  // 1.5a — Pre-sync state ophalen vóór de upsert (de huidige charge_points-rijen
  //         houden nog de vorige sync-waarde). Nodig voor transitie-detectie.
  const faultDetectionEnabled = org?.fault_detection_enabled !== false;
  const prevMap = new Map<string, {
    cp_id: string; status: string | null; connectivity_state: string | null;
    operational_status: string | null; is_disabled: boolean | null;
    location_id: string | null; client_id: string | null;
  }>();
  const openFaultCpIds = new Set<string>();
  if (faultDetectionEnabled) {
    const controllerIds = allEvses.map((e) => e.id).filter(Boolean);
    if (controllerIds.length > 0) {
      const { data: prevRows } = await supabase
        .from("charge_points")
        .select("id, eflux_evse_controller_id, status, connectivity_state, operational_status, is_disabled, location_id, locations(client_id)")
        .in("eflux_evse_controller_id", controllerIds);
      for (const r of prevRows ?? []) {
        const row = r as unknown as {
          id: string; eflux_evse_controller_id: string | null; status: string | null;
          connectivity_state: string | null; operational_status: string | null; is_disabled: boolean | null;
          location_id: string | null; locations?: { client_id?: string | null } | null;
        };
        if (row.eflux_evse_controller_id) {
          prevMap.set(row.eflux_evse_controller_id, {
            cp_id: row.id, status: row.status, connectivity_state: row.connectivity_state,
            operational_status: row.operational_status, is_disabled: row.is_disabled,
            location_id: row.location_id, client_id: row.locations?.client_id ?? null,
          });
        }
      }
    }
    const { data: openF } = await supabase
      .from("charge_point_faults")
      .select("charge_point_id")
      .in("status", OPEN_FAULT_STATUSES);
    for (const f of openF ?? []) openFaultCpIds.add((f as { charge_point_id: string }).charge_point_id);
  }

  // Nieuw geopende storingen, voor de gebundelde notificatie per locatie.
  const newlyOpened: { fault_id: string; location_id: string | null }[] = [];

  // 1.5b — upsert charge_points + transitie-gebaseerde storingsdetectie
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
      continue;
    }
    cpSummary.upserted++;

    if (!faultDetectionEnabled) continue;
    const prev = prevMap.get(evse.id);
    // Nieuwe paal (geen vorige staat): alleen seeden, nooit een storing openen.
    if (!prev) continue;

    const newClass = classifyFault({
      connectivityState: evse.connectivityState,
      operationalStatus: evse.evseOperationalStatus?.canonicalStatus,
      isDisabled: evse.isDisabled,
    });
    const prevClass = classifyFault({
      connectivityState: prev.connectivity_state,
      operationalStatus: prev.operational_status,
      isDisabled: prev.is_disabled,
    });

    // gezond -> storing: open een nieuwe storing (als er nog geen open is).
    if (!prevClass.isFault && newClass.isFault && !openFaultCpIds.has(prev.cp_id)) {
      const { data: inserted, error: insErr } = await supabase
        .from("charge_point_faults")
        .insert({
          charge_point_id: prev.cp_id,
          location_id: prev.location_id,
          client_id: prev.client_id,
          organization_id: org?.id ?? null,
          status: "nieuw",
          severity: "storing",
          fault_reason: newClass.reason ?? "connectivity",
          road_connectivity_state: evse.connectivityState ?? null,
          road_operational_status: evse.evseOperationalStatus?.canonicalStatus ?? null,
          first_status: cpRow.status,
        })
        .select("id")
        .maybeSingle();
      if (!insErr && inserted) {
        openFaultCpIds.add(prev.cp_id);
        await supabase.from("charge_point_fault_events").insert({
          fault_id: inserted.id, event_type: "detected", to_status: "nieuw",
          note: `Storing gedetecteerd (${newClass.reason ?? "connectivity"})`,
        });
        newlyOpened.push({ fault_id: inserted.id, location_id: prev.location_id });
      }
    } else if (prevClass.isFault && !newClass.isFault && openFaultCpIds.has(prev.cp_id)) {
      // storing -> gezond: automatisch sluiten.
      const { data: openRow } = await supabase
        .from("charge_point_faults")
        .select("id")
        .eq("charge_point_id", prev.cp_id)
        .in("status", OPEN_FAULT_STATUSES)
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openRow) {
        await supabase.from("charge_point_faults")
          .update({ status: "automatisch_hersteld", auto_recovered: true, resolved_at: new Date().toISOString() })
          .eq("id", openRow.id);
        await supabase.from("charge_point_fault_events").insert({
          fault_id: openRow.id, event_type: "recovered", to_status: "automatisch_hersteld",
          note: "Paal kwam automatisch weer online",
        });
        openFaultCpIds.delete(prev.cp_id);
      }
    }
  }

  // 1.5c — Gebundelde storingsmail per locatie (best-effort).
  if (newlyOpened.length > 0) {
    const byLoc = new Map<string, string[]>();
    for (const f of newlyOpened) {
      const key = f.location_id ?? "none";
      const arr = byLoc.get(key) ?? [];
      arr.push(f.fault_id);
      byLoc.set(key, arr);
    }
    for (const [locKey, faultIds] of byLoc) {
      try {
        await invokeSendFaultNotification({
          location_id: locKey === "none" ? null : locKey,
          fault_ids: faultIds,
        });
      } catch (e) {
        console.warn("send-fault-notification failed:", (e as Error).message);
      }
    }
  }

  await logSync(supabase, "locations", "success", locSummary.upserted);
  await logSync(supabase, "charge_points", "success", cpSummary.upserted);

  return { locations: locSummary, chargePoints: cpSummary };
}

async function invokeSendFaultNotification(body: Record<string, unknown>) {
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!internalSecret || !supabaseUrl) throw new Error("INTERNAL_FUNCTION_SECRET of SUPABASE_URL ontbreekt");
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-internal-secret": internalSecret };
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (anonKey) headers.apikey = anonKey;
  const res = await fetch(`${supabaseUrl}/functions/v1/send-fault-notification`, {
    method: "POST", headers, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`send-fault-notification returned ${res.status}`);
  return { triggered: true };
}

function mapRoadLocationToRow(eflux_location_id: string, detail: RoadLocation | null) {
  if (!detail) {
    return {
      eflux_location_id,
      name: `Locatie ${eflux_location_id.slice(0, 8)}`,
    };
  }

  // geoLocation.coordinates is [longitude, latitude] (GeoJSON-conventie)
  const coords = detail.geoLocation?.coordinates;
  const longitude = Array.isArray(coords) && coords.length === 2 ? coords[0] : null;
  const latitude = Array.isArray(coords) && coords.length === 2 ? coords[1] : null;

  return {
    eflux_location_id,
    name: detail.name ?? detail.address ?? `Locatie ${eflux_location_id.slice(0, 8)}`,
    address: detail.address ?? null,
    city: detail.city ?? null,
    postal_code: detail.postal_code ?? null,
    country_code: detail.country ?? null,
    latitude,
    longitude,
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
  supabase: SupabaseClient,
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
          client_id: (cp as { locations?: { client_id?: string | null } }).locations?.client_id ?? null,
        });
      }
    }
  }

  // Paginated fetch sessions sinds last sync
  let skip = 0;
  let totalFetched = 0;
  while (true) {
    const params: Record<string, unknown> = {
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

  // KRITIEK: alleen 'success' loggen (= watermark verschuiven) als ELKE batch slaagde.
  // Faalde een upsert-batch, dan NIET als success markeren — de cursor blijft staan en
  // de volgende run herhaalt vanaf de vorige watermark (onConflict-upsert is idempotent,
  // dus reeds opgeslagen sessies worden onschadelijk her-upsert). Voorheen werd hier
  // altijd 'success' geschreven, waardoor gefaalde sessies permanent werden overgeslagen
  // (stil dataverlies op het geld-pad).
  if (summary.errors > 0) {
    await logSync(
      supabase,
      "cpo_sessions",
      "failed",
      summary.upserted,
      `${summary.errors} sessie(s) niet opgeslagen; watermark niet verschoven om dataverlies te voorkomen`,
    );
  } else {
    await logSync(supabase, "cpo_sessions", "success", summary.upserted);
  }
  return summary;
}

function mapRoadSessionToRow(
  s: RoadCPOSession,
  cpInfo: { cp_id: string; location_id: string; client_id: string | null },
) {
  // Road's search response bevat alle bedragen direct — geen aparte reimbursement-call nodig.
  // Bron: GET /2/sessions/cpo/search/fast retourneert priceWithFX + reimbursementAmount per sessie.
  const energyCost = Number(s.energyCosts ?? 0);
  const grossRevenue = Number(s.priceWithFX?.originalAmount ?? s.totalPrice ?? 0);
  const reimbursementAmount = Number(
    s.priceWithFX?.originalReimbursementAmount ?? s.reimbursementAmount ?? 0
  );
  // Client/echarging-share worden op kwartaal-niveau berekend in aggregate-settlements
  // (na aftrek stroominkoop + abonnementskosten). Per sessie zetten we ze op 0.
  const clientShare = 0;
  const echargingShare = 0;

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
    gross_revenue: grossRevenue,
    energy_cost: energyCost,
    energy_costs: energyCost,
    time_costs: s.timeCosts ?? 0,
    start_costs: s.startCosts ?? 0,
    idle_costs: s.idleCosts ?? 0,
    total_price: grossRevenue,
    external_calculated_price: s.externalCalculatedPrice ?? null,
    reimbursement_amount: reimbursementAmount,
    reimbursement_synced_at: new Date().toISOString(),
    net_margin: reimbursementAmount,
    client_share: clientShare,
    echarging_share: echargingShare,
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
// Invoices — self-billing facturen van Road
// =====================================================================

async function syncInvoices(client: RoadClient, supabase: SupabaseClient): Promise<SyncSummary> {
  const summary: SyncSummary = { fetched: 0, upserted: 0, errors: 0 };

  const allInvoices: RoadInvoice[] = [];
  let skip = 0;
  while (true) {
    const result = await client.searchInvoices({ limit: PAGE, skip });
    allInvoices.push(...result.data);
    if (result.data.length < PAGE) break;
    skip += PAGE;
    if (skip > 10_000) break; // safety
  }
  summary.fetched = allInvoices.length;

  for (const inv of allInvoices) {
    const row = {
      eflux_invoice_id: inv.id,
      eflux_account_id: inv.accountId ?? null,
      identifier: inv.identifier ?? null,
      billing_run_id: inv.billingRunId ?? null,
      currency: inv.currency ?? "EUR",
      is_paid: inv.isPaid ?? false,
      is_ready: inv.isReady ?? false,
      has_error: inv.hasError ?? false,
      total_amount_with_vat: inv.totalAmountWithVat ?? null,
      total_credit_amount_with_vat: inv.totalCreditAmountWithVat ?? null,
      type: inv.type ?? null,
      month: inv.month ?? null,
      year: inv.year ?? null,
      account_name: inv.account?.name ?? null,
      raw_data: inv as unknown,
      road_created_at: inv.createdAt ?? null,
      road_updated_at: inv.updatedAt ?? null,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("eflux_invoices")
      .upsert(row, { onConflict: "eflux_invoice_id", ignoreDuplicates: false });

    if (error) {
      console.error("upsert invoice failed:", error.message);
      summary.errors++;
    } else {
      summary.upserted++;
    }
  }

  await logSync(supabase, "invoices", "success", summary.upserted);
  return summary;
}

// =====================================================================
// Helpers
// =====================================================================

async function getLastSync(supabase: SupabaseClient, entityType: string): Promise<string | null> {
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
  supabase: SupabaseClient,
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
