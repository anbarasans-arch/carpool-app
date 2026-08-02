import { Platform } from 'react-native';
import posthog from 'posthog-js';

const posthogKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST;

if (Platform.OS === 'web' && posthogKey && posthogHost) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_exceptions: true,
  });
}

function getPosthog() {
  return Platform.OS === 'web' && posthogKey && posthogHost ? posthog : null;
}

export function identifyUser(userId: string, email?: string) {
  getPosthog()?.identify(userId, email ? { email } : undefined);
}

export function resetAnalyticsUser() {
  getPosthog()?.reset();
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  getPosthog()?.capture(name, properties);
}
