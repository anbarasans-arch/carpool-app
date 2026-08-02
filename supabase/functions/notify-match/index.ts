// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_SENDER_EMAIL = Deno.env.get("RESEND_SENDER_EMAIL")!;
const RESEND_SENDER_NAME = Deno.env.get("RESEND_SENDER_NAME") ?? "carpool-app";
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://lets-carpool.com";
const MY_MATCHES_URL = `${SITE_URL}/?tab=matches`;

// Called right after a client action that already succeeded (either side
// proposing a match, or the other side confirming it) to send a heads-up
// email. Uses "user" auth so ctx.userClaims.id is a verified caller
// identity - the authorization check below (is this caller actually the
// right participant for this event) is done explicitly here rather than
// relying on RLS, since the actual email lookups need a service-role
// client that bypasses RLS entirely (public.users only allows seeing your
// own row).
//
// Matching is bidirectional (a rider can request a trip, or a driver can
// invite a rider - see migration 20260802090000), so direction is read
// from matches.proposed_by rather than assumed from the event name: for
// "proposed" the recipient is whichever side did NOT propose, and for
// "confirmed" the recipient is whoever DID propose (the responder is the
// one who just confirmed, so they don't need their own email).
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

    if (typeof matchId !== "string" || (event !== "proposed" && event !== "confirmed")) {
      return Response.json({ error: "Invalid match_id or event" }, { status: 400 });
    }

    const callerId = ctx.userClaims.id;
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: match, error: fetchError } = await supabaseAdmin
      .from("matches")
      .select(
        "id, proposed_by, trips(driver_id, departure_time, users(email)), ride_requests(rider_id, users(email))",
      )
      .eq("id", matchId)
      .single<{
        id: string;
        proposed_by: string;
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
    const proposerIsDriver = match.proposed_by === driverId;

    const authorized =
      (event === "proposed" && callerId === match.proposed_by) ||
      (event === "confirmed" &&
        (callerId === driverId || callerId === riderId) &&
        callerId !== match.proposed_by);

    if (!authorized) {
      return Response.json({ message: "No notification sent." });
    }

    let recipientEmail: string;
    let subject: string;
    let html: string;

    if (event === "proposed") {
      recipientEmail = proposerIsDriver ? riderEmail : driverEmail;
      subject = proposerIsDriver ? "A driver invited you to share a ride" : "You have a new ride request";
      html = proposerIsDriver
        ? `<p>A driver invited you to share their trip.</p><p><a href="${MY_MATCHES_URL}">Open My matches</a> to confirm or decline.</p>`
        : `<p>Someone requested to join one of your trips.</p><p><a href="${MY_MATCHES_URL}">Open My matches</a> to confirm or decline.</p>`;
    } else {
      recipientEmail = proposerIsDriver ? driverEmail : riderEmail;
      subject = "Your ride match is confirmed";
      html = `<p>Your ride match is confirmed!</p><p><a href="${MY_MATCHES_URL}">Open My matches</a> to see contact info.</p>`;
    }

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
