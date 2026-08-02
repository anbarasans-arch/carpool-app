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
