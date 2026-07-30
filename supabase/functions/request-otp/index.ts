// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Only @fmr.com addresses may request a code. This check must happen here,
// before signInWithOtp is ever called - the client must not be able to
// trigger an OTP email by calling Supabase Auth directly.
const FMR_EMAIL = /^[^\s@]+@fmr\.com$/i;

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

    if (typeof email !== "string" || !FMR_EMAIL.test(email)) {
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
