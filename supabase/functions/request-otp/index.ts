// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Only @fmr.com addresses may request a code. This check must happen here,
// before signInWithOtp is ever called - the client must not be able to
// trigger an OTP email by calling Supabase Auth directly.
//
// TEMPORARY TEST MODE (added 2026-08-02): @gmail.com is allowed too, so the
// solo builder can test driver + rider flows via Gmail plus-addressing
// (e.g. you+driver@gmail.com / you+rider@gmail.com) without spamming their
// own @fmr.com inbox or needing multiple corporate accounts. REMOVE the
// "gmail.com" entry (and the matching DB check constraint change in
// supabase/migrations/20260802*_allow_test_domain.sql) before any wider
// pilot rollout - see FOLLOWUPS.md.
const ALLOWED_DOMAINS = ["fmr.com", "gmail.com"];
const ALLOWED_EMAIL = new RegExp(
  `^[^\\s@]+@(${ALLOWED_DOMAINS.map((d) => d.replace(".", "\\.")).join("|")})$`,
  "i",
);

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    let email: unknown;
    try {
      ({ email } = await req.json());
    } catch {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (typeof email !== "string" || !ALLOWED_EMAIL.test(email)) {
      return Response.json(
        { error: "Only @fmr.com email addresses may request a sign-in code." },
        { status: 403 },
      );
    }

    const { error } = await ctx.supabase.auth.signInWithOtp({
      email: email.toLowerCase(),
    });

    if (error) {
      console.error(error);
      return Response.json(
        { error: "Could not send code. Please try again." },
        { status: 500 },
      );
    }

    return Response.json({ message: "Code sent." });
  }),
};
