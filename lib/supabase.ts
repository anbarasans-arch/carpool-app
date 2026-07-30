import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web handles its own URL-based session detection; native does not need it.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export async function requestOtp(email: string): Promise<{ error: string | null }> {
  const response = await fetch(`${supabaseUrl}/functions/v1/request-otp`, {
    method: 'POST',
    headers: {
      apikey: supabasePublishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  const body = await response.json();

  if (!response.ok) {
    return { error: body.error ?? 'Could not send code. Please try again.' };
  }

  return { error: null };
}
