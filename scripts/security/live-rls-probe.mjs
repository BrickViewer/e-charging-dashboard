import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    let value = raw.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv(path.join(process.cwd(), ".env"));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error("Missing env. Required: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const runId = `security_probe_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const password = `Probe-${Date.now()}-A1!`;
const ids = {
  users: [],
  clients: [],
  locations: [],
  chargePoints: [],
  settlements: [],
  userRoles: [],
};

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const checks = [];

function ok(name, detail = "") {
  checks.push({ name, status: "ok", detail });
  console.log(`ok - ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, detail = "") {
  checks.push({ name, status: "fail", detail });
  throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function expect(condition, name, detail = "") {
  if (!condition) fail(name, detail);
  ok(name, detail);
}

function authedClient(token) {
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function createUser(label) {
  const email = `${runId}+${label}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { security_probe_run_id: runId, label },
  });
  if (error) throw error;
  ids.users.push(data.user.id);
  return { id: data.user.id, email };
}

async function signIn(email) {
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return authedClient(data.session.access_token);
}

async function insertOne(table, row, bucket) {
  const { data, error } = await service.from(table).insert(row).select("id").single();
  if (error) throw error;
  ids[bucket].push(data.id);
  return data.id;
}

async function seed() {
  const { data: org, error: orgError } = await service
    .from("organizations")
    .select("id")
    .limit(1)
    .single();
  if (orgError) throw orgError;

  const adminUser = await createUser("admin");
  const viewerUser = await createUser("viewer");
  const portalUser = await createUser("portal");

  for (const [user, role] of [[adminUser, "admin"], [viewerUser, "viewer"]]) {
    const { data, error } = await service
      .from("user_roles")
      .insert({ user_id: user.id, role })
      .select("id")
      .single();
    if (error) throw error;
    ids.userRoles.push(data.id);
  }

  const ownClientId = await insertOne("clients", {
    organization_id: org.id,
    company_name: `${runId} Own Client`,
    contact_email: portalUser.email,
    portal_user_id: portalUser.id,
    status: "actief",
  }, "clients");
  const otherClientId = await insertOne("clients", {
    organization_id: org.id,
    company_name: `${runId} Other Client`,
    contact_email: `${runId}+other@example.com`,
    status: "actief",
  }, "clients");

  const ownLocationId = await insertOne("locations", {
    client_id: ownClientId,
    name: `${runId} Own Location`,
    address: "Probe straat 1",
    city: "Amsterdam",
    eflux_location_id: `${runId}_own_location`,
  }, "locations");
  const otherLocationId = await insertOne("locations", {
    client_id: otherClientId,
    name: `${runId} Other Location`,
    address: "Probe straat 2",
    city: "Amsterdam",
    eflux_location_id: `${runId}_other_location`,
  }, "locations");
  const unlinkedLocationId = await insertOne("locations", {
    name: `${runId} Unlinked Location`,
    address: "Probe straat 3",
    city: "Amsterdam",
    eflux_location_id: `${runId}_unlinked_location`,
  }, "locations");

  const ownChargePointId = await insertOne("charge_points", {
    location_id: ownLocationId,
    name: `${runId} CP`,
    type: "ac_11",
    status: "online",
    eflux_evse_controller_id: `${runId}_cp`,
    num_connectors: 1,
  }, "chargePoints");

  const baseSettlement = {
    period_start: "2026-01-01",
    period_end: "2026-03-31",
    year: 2026,
    quarter: 1,
    total_kwh: 100,
    total_sessions: 10,
    gross_revenue: 50,
    total_energy_cost: 25,
    total_platform_fee: 5,
    total_transaction_fees: 0,
    net_margin: 20,
    client_payout: 15,
    echarging_revenue: 5,
    ere_estimate: 1,
    ere_commission: 0,
    eflux_setup_fee_paal_ids: [],
  };

  const statuses = [
    { status: "live", year: 2026, quarter: 1 },
    { status: "calculated", year: 2026, quarter: 2 },
    { status: "approved", year: 2026, quarter: 3 },
    { status: "paid", year: 2026, quarter: 4 },
    { status: "charged_back", year: 2025, quarter: 3 },
  ];
  const settlementIds = {};
  for (const { status, year, quarter } of statuses) {
    const id = await insertOne("quarterly_settlements", {
      ...baseSettlement,
      client_id: ownClientId,
      year,
      quarter,
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    }, "settlements");
    settlementIds[status] = id;
  }
  const otherApprovedId = await insertOne("quarterly_settlements", {
    ...baseSettlement,
    client_id: otherClientId,
    year: 2025,
    quarter: 4,
    status: "approved",
  }, "settlements");

  return {
    adminUser,
    viewerUser,
    portalUser,
    ownClientId,
    otherClientId,
    ownLocationId,
    otherLocationId,
    unlinkedLocationId,
    ownChargePointId,
    settlementIds,
    otherApprovedId,
  };
}

async function expectError(resultPromise, name) {
  const result = await resultPromise;
  if (!result.error) fail(name, "expected an error");
  ok(name, result.error.message ?? "blocked");
}

async function expectBlockedOrNoEffect(resultPromise, name, verifyNoEffect) {
  const result = await resultPromise;
  if (result.error) {
    ok(name, result.error.message ?? "blocked");
    return;
  }
  const detail = await verifyNoEffect();
  if (detail !== true) fail(name, String(detail));
  ok(name, "no rows changed");
}

async function runProbe() {
  const fixture = await seed();
  const admin = await signIn(fixture.adminUser.email);
  const viewer = await signIn(fixture.viewerUser.email);
  const portal = await signIn(fixture.portalUser.email);

  const { data: portalSettlements, error: portalReadError } = await portal
    .from("quarterly_settlements")
    .select("id, client_id, status")
    .order("quarter", { ascending: true });
  if (portalReadError) throw portalReadError;
  const portalIds = new Set((portalSettlements ?? []).map((row) => row.id));
  expect(portalIds.has(fixture.settlementIds.approved), "portal sees own approved settlement");
  expect(portalIds.has(fixture.settlementIds.paid), "portal sees own paid settlement");
  expect(portalIds.has(fixture.settlementIds.charged_back), "portal sees own charged_back settlement");
  expect(!portalIds.has(fixture.settlementIds.live), "portal cannot read own live settlement");
  expect(!portalIds.has(fixture.settlementIds.calculated), "portal cannot read own calculated settlement");
  expect(!portalIds.has(fixture.otherApprovedId), "portal cannot read another client settlement");

  await expectError(
    portal.rpc("mark_settlements_paid", { settlement_ids: [fixture.settlementIds.approved] }),
    "portal cannot call mark_settlements_paid",
  );
  await expectError(
    portal.rpc("set_location_client", { location_id: fixture.unlinkedLocationId, client_id: fixture.ownClientId }),
    "portal cannot call set_location_client",
  );
  await expectBlockedOrNoEffect(
    portal.from("quarterly_settlements").update({ status: "paid" }).eq("id", fixture.settlementIds.approved),
    "portal cannot directly update settlement status",
    async () => {
      const { data, error } = await service
        .from("quarterly_settlements")
        .select("status")
        .eq("id", fixture.settlementIds.approved)
        .single();
      if (error) throw error;
      return data.status === "approved" || `status changed to ${data.status}`;
    },
  );

  await expectError(
    viewer.from("activity_log").insert({
      action: "probe_spoof",
      description: "viewer should not insert this",
      client_id: fixture.ownClientId,
    }),
    "viewer cannot insert activity_log",
  );
  await expectError(
    viewer.rpc("mark_settlements_paid", { settlement_ids: [fixture.settlementIds.approved] }),
    "viewer cannot mark settlements paid",
  );

  const { error: paidError } = await admin.rpc("mark_settlements_paid", {
    settlement_ids: [fixture.settlementIds.approved],
  });
  if (paidError) throw paidError;
  ok("admin can mark approved settlement paid via RPC");

  const { error: linkError } = await admin.rpc("set_location_client", {
    location_id: fixture.unlinkedLocationId,
    client_id: fixture.ownClientId,
  });
  if (linkError) throw linkError;
  ok("admin can link location via RPC");

  await expectBlockedOrNoEffect(
    admin.from("quarterly_settlements").update({ status: "paid" }).eq("id", fixture.settlementIds.calculated),
    "admin cannot directly update settlement status",
    async () => {
      const { data, error } = await service
        .from("quarterly_settlements")
        .select("status")
        .eq("id", fixture.settlementIds.calculated)
        .single();
      if (error) throw error;
      return data.status === "calculated" || `status changed to ${data.status}`;
    },
  );
  await expectBlockedOrNoEffect(
    admin.from("locations").update({ client_id: fixture.otherClientId }).eq("id", fixture.unlinkedLocationId),
    "admin cannot directly update locations.client_id",
    async () => {
      const { data, error } = await service
        .from("locations")
        .select("client_id")
        .eq("id", fixture.unlinkedLocationId)
        .single();
      if (error) throw error;
      return data.client_id === fixture.ownClientId || `client_id changed to ${data.client_id}`;
    },
  );

  await expectError(
    anon.rpc("has_role", { _user_id: fixture.adminUser.id, _role: "admin" }),
    "anon cannot call dropped has_role RPC",
  );
  await expectError(
    anon.rpc("accept_client_invitation", {
      invitation_token_hash: "probe",
      accepted_user_id: fixture.portalUser.id,
    }),
    "anon cannot call accept_client_invitation",
  );
  await expectError(
    anon.from("client_invitations").select("token").limit(1),
    "anon cannot select removed invitation token column",
  );

  for (const fn of ["aggregate-settlements", "eflux-sync", "eflux-test-connection"]) {
    const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status === 401, `unauthenticated ${fn} returns 401`, `status ${res.status}`);
  }
  const inviteRes = await fetch(`${supabaseUrl}/functions/v1/send-client-invitation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: fixture.ownClientId }),
  });
  expect(inviteRes.status === 401, "unauthenticated send-client-invitation returns 401", `status ${inviteRes.status}`);
}

async function cleanup() {
  const errors = [];
  async function cleanupStep(label, fn) {
    try {
      await fn();
    } catch (err) {
      errors.push(`${label}: ${err.message}`);
    }
  }

  await cleanupStep("settlements", () => ids.settlements.length
    ? service.from("quarterly_settlements").delete().in("id", ids.settlements)
    : Promise.resolve());
  await cleanupStep("charge_points", () => ids.chargePoints.length
    ? service.from("charge_points").delete().in("id", ids.chargePoints)
    : Promise.resolve());
  await cleanupStep("locations", () => ids.locations.length
    ? service.from("locations").delete().in("id", ids.locations)
    : Promise.resolve());
  await cleanupStep("clients", () => ids.clients.length
    ? service.from("clients").delete().in("id", ids.clients)
    : Promise.resolve());
  await cleanupStep("user_roles", () => ids.userRoles.length
    ? service.from("user_roles").delete().in("id", ids.userRoles)
    : Promise.resolve());
  for (const userId of ids.users) {
    await cleanupStep(`user ${userId}`, () => service.auth.admin.deleteUser(userId));
  }

  if (errors.length > 0) {
    console.error("Cleanup incomplete");
    console.error(JSON.stringify({ runId, ids, errors }, null, 2));
    process.exitCode = 1;
  } else {
    ok("cleanup removed all probe fixtures", runId);
  }
}

try {
  await runProbe();
} finally {
  await cleanup();
}

const failed = checks.filter((check) => check.status !== "ok");
if (failed.length > 0) {
  console.error(JSON.stringify({ runId, failed }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: "ok", runId, checks: checks.length }, null, 2));
