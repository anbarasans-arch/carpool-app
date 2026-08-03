// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Normally only @fmr.com addresses may request a code, checked here before
// signInWithOtp is ever called - the client must not be able to trigger an
// OTP email by calling Supabase Auth directly.
//
// TEMPORARY VALIDATION MODE (widened 2026-08-03): sign-in is open to ANY
// email domain right now, not just @fmr.com - the company wouldn't sanction
// sending automated validation/test emails to real @fmr.com inboxes, so
// broader beta testers (not just the solo builder) need a way in that
// doesn't touch fmr.com at all. This is a real, deliberate widening of who
// can create an account - anyone who finds the URL can sign up and see
// other testers' contact info once matched. Fine for an invite-only
// validation group, NOT fine left on for a real internal rollout.
// SET EMAIL_VALIDATION_MODE = false (and revert the matching DB check
// constraint in supabase/migrations/20260802*_allow_test_domain.sql /
// 20260803*_open_all_domains.sql) before that happens - see FOLLOWUPS.md.
const EMAIL_VALIDATION_MODE = true;
const FMR_ONLY_EMAIL = /^[^\s@]+@fmr\.com$/i;
const ANY_VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_EMAIL = EMAIL_VALIDATION_MODE ? ANY_VALID_EMAIL : FMR_ONLY_EMAIL;

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
        {
          error: EMAIL_VALIDATION_MODE
            ? "Enter a valid email address."
            : "Only @fmr.com email addresses may request a sign-in code.",
        },
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
