// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_SENDER_EMAIL = Deno.env.get("RESEND_SENDER_EMAIL")!;
const RESEND_SENDER_NAME = Deno.env.get("RESEND_SENDER_NAME") ?? "carpool-app";

// Called right after a client action that already succeeded (a rider
// proposing a match, or a driver confirming one) to send a heads-up email.
// Uses "user" auth so ctx.userClaims.id is a verified caller identity - the
// authorization check below (is this caller actually a participant of this
// match, in the right role for this event) is done explicitly here rather
// than relying on RLS, since the actual email lookups need a service-role
// client that bypasses RLS entirely (public.users only allows seeing your
// own row).
export default {
  fetch: withSupabase({ auth: ["user"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    let matchId: unknown;
    let event: unknown;
    try {
      ({ match_id: matchId, event } = await req.json());
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (typeof matchId !== "string" || (event !== "requested" && event !== "confirmed")) {
      return Response.json({ error: "Invalid match_id or event" }, { status: 400 });
    }

    const callerId = ctx.userClaims.id;
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: match, error: fetchError } = await supabaseAdmin
      .from("matches")
      .select(
        "id, trips(driver_id, departure_time, users(email)), ride_requests(rider_id, users(email))",
      )
      .eq("id", matchId)
      .single<{
        id: string;
        trips: { driver_id: string; departure_time: string; users: { email: string } } | null;
        ride_requests: { rider_id: string; users: { email: string } } | null;
      }>();

    if (fetchError || !match || !match.trips || !match.ride_requests) {
      // Don't leak whether the match exists - just decline quietly.
      return Response.json({ message: "No notification sent." });
    }

    const driverId = match.trips.driver_id;
    const riderId = match.ride_requests.rider_id;
    const driverEmail = match.trips.users.email;
    const riderEmail = match.ride_requests.users.email;

    const authorized =
      (event === "requested" && callerId === riderId) ||
      (event === "confirmed" && callerId === driverId);

    if (!authorized) {
      return Response.json({ message: "No notification sent." });
    }

    const recipientEmail: string = event === "requested" ? driverEmail : riderEmail;
    const subject =
      event === "requested" ? "You have a new ride request" : "Your ride match is confirmed";
    const html =
      event === "requested"
        ? "<p>Someone requested to join one of your trips. Open the app to confirm or decline.</p>"
        : "<p>Your ride match is confirmed! Open the app to see your driver's contact info.</p>";

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${RESEND_SENDER_NAME} <${RESEND_SENDER_EMAIL}>`,
        to: [recipientEmail],
        subject,
        html,
      }),
    });

    if (!emailResponse.ok) {
      console.error(await emailResponse.text());
      return Response.json({ error: "Could not send notification." }, { status: 500 });
    }

    return Response.json({ message: "Notification sent." });
  }),
};
