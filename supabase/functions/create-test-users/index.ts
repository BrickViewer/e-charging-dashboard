import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const results: string[] = [];

  try {
    // 1. Update admin password
    const adminId = "896f50bf-a634-4609-b153-ce9dd2bc8aad";
    const { error: updateErr } = await admin.auth.admin.updateUserById(adminId, {
      password: "welkom123",
    });
    results.push(updateErr ? `Admin pw update failed: ${updateErr.message}` : "Admin pw set to welkom123");

    // 2. Create client user
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u: any) => u.email === "info@brickviewer.nl");

    let clientUserId: string;
    if (existing) {
      clientUserId = existing.id;
      await admin.auth.admin.updateUserById(clientUserId, { password: "welkom123" });
      results.push(`Client user already exists (${clientUserId}), pw updated`);
    } else {
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: "info@brickviewer.nl",
        password: "welkom123",
        email_confirm: true,
      });
      if (createErr) throw createErr;
      clientUserId = newUser.user!.id;
      results.push(`Client user created: ${clientUserId}`);
    }

    // 3. Link to demo client
    const { error: linkErr } = await admin
      .from("clients")
      .update({ portal_user_id: clientUserId })
      .eq("id", "10000000-0000-0000-0000-000000000001");

    results.push(linkErr ? `Link failed: ${linkErr.message}` : "Client linked to demo client");

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
