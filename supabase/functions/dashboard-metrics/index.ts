// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const DASHBOARD_METRICS_SECRET = Deno.env.get("DASHBOARD_METRICS_SECRET")!;

// Feeds Carpool Pulse's daily scheduled refresh (see dashboard/README.md).
// Returns aggregate usage counts only - no PII, no per-user rows.
//
// Gated by a shared secret header, independent of and in addition to the
// publishable-key gateway auth Supabase already requires for every function
// - the anon key alone is shipped in the client bundle and must never be
// enough on its own to pull aggregate stats about every user. The
// underlying get_dashboard_metrics() function is separately locked to
// service_role (see migration 20260815020000), so even a leaked secret
// here doesn't help against RLS - it's defense in depth, not the only gate.
export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req) => {
    if (req.method !== "GET") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const providedSecret = req.headers.get("x-dashboard-secret");
    if (!providedSecret || providedSecret !== DASHBOARD_METRICS_SECRET) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data, error } = await supabaseAdmin.rpc("get_dashboard_metrics");

    if (error) {
      console.error(error);
      return Response.json({ error: "Could not load metrics." }, { status: 500 });
    }

    return Response.json(data);
  }),
};
