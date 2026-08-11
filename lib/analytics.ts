import { Platform } from 'react-native';

// Web-only for now (native isn't built yet - see FOLLOWUPS.md), loaded
// dynamically so it never ends up in the native bundle. Mirrors the
// maplibre-gl loading pattern in components/LocationPicker.tsx.
//
// Privacy: this app stores home/work commute data (see PROJECT.md section 7
// "Open flags"), so autocapture and session recording are explicitly
// disabled - we only send the named events below, and their properties are
// deliberately non-identifying (no email, no address text, no coordinates).
let posthogPromise: Promise<any> | null = null;

// Connection quality at the moment the app loaded, so a defect report can
// distinguish "this only happens on slow LTE" from "this happens on wifi
// too". navigator.connection is Chrome/Android only (not Safari/iOS, not
// Firefox) - absent on unsupported browsers rather than guessed at.
function getNetworkInfo(): Record<string, unknown> {
  if (typeof navigator === 'undefined') return {};
  const connection =
    (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;
  if (!connection) return {};
  return {
    network_effective_type: connection.effectiveType ?? null,
    network_downlink_mbps: connection.downlink ?? null,
    network_rtt_ms: connection.rtt ?? null,
    network_save_data: connection.saveData ?? null,
  };
}

function getPosthog(): Promise<any> | null {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (Platform.OS !== 'web' || !apiKey) return null;

  if (!posthogPromise) {
    posthogPromise = import('posthog-js').then((mod: any) => {
      const posthog = mod.default ?? mod;
      posthog.init(apiKey, {
        api_host: process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
        autocapture: false,
        capture_pageview: false,
        disable_session_recording: true,
        persistence: 'localStorage',
      });

      // Super properties: attached to every event automatically (device/
      // browser/OS are already captured by PostHog by default on every
      // event - this only adds what it doesn't already send).
      posthog.register(getNetworkInfo());
      const connection = (navigator as any).connection;
      connection?.addEventListener?.('change', () => posthog.register(getNetworkInfo()));

      return posthog;
    });
  }
  return posthogPromise;
}

export function identifyUser(userId: string) {
  getPosthog()?.then((posthog) => posthog.identify(userId));
}

export function resetAnalyticsUser() {
  getPosthog()?.then((posthog) => posthog.reset());
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  getPosthog()?.then((posthog) => posthog.capture(name, properties));
}

// Fires alongside every setError(...) the app already shows the user, so a
// defect report has more than "the user said something broke" to go on -
// pulling up this person's timeline in PostHog (search their email/distinct
// ID) shows exactly which screen/action failed and with what message,
// alongside the device/browser/network context above.
export function trackError(context: string, message: string, extra?: Record<string, unknown>) {
  trackEvent('app_error', { context, message, ...extra });
}

// Catches crashes that never go through a screen's own try/catch - a
// genuinely unexpected JS error, not a validation message the user is
// meant to see and fix.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    trackError('window.onerror', e.message, { filename: e.filename, lineno: e.lineno });
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    trackError('unhandledrejection', String(e.reason?.message ?? e.reason));
  });
}
