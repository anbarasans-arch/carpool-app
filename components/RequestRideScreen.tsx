import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import DateTimeField from './DateTimeField';
import LocationPicker from './LocationPicker';
import { supabase } from '../lib/supabase';
import type { GeocodeResult } from '../lib/geocode';

export default function RequestRideScreen() {
  const [origin, setOrigin] = useState<GeocodeResult | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const windowStartRef = useRef<any>(null);
  const windowEndRef = useRef<any>(null);

  async function handleSubmit() {
    setError(null);

    const windowStartValue: string = windowStartRef.current?.value ?? '';
    const windowEndValue: string = windowEndRef.current?.value ?? '';

    if (!origin || !destination) {
      setError('Pick both an origin and a destination.');
      return;
    }
    if (!windowStartValue || !windowEndValue) {
      setError('Pick your earliest and latest departure time.');
      return;
    }
    if (new Date(windowEndValue) <= new Date(windowStartValue)) {
      setError('Latest departure must be after earliest departure.');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    setSubmitting(true);
    const { error: insertError } = await supabase.from('ride_requests').insert({
      rider_id: user.id,
      origin_point: `SRID=4326;POINT(${origin.lng} ${origin.lat})`,
      destination_point: `SRID=4326;POINT(${destination.lng} ${destination.lat})`,
      desired_time_start: new Date(windowStartValue).toISOString(),
      desired_time_end: new Date(windowEndValue).toISOString(),
    });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess(true);
    setOrigin(null);
    setDestination(null);
    if (windowStartRef.current) windowStartRef.current.value = '';
    if (windowEndRef.current) windowEndRef.current.value = '';
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Request a ride</Text>

      <LocationPicker label="Origin" value={origin} onChange={setOrigin} />
      <LocationPicker label="Destination" value={destination} onChange={setDestination} />

      <DateTimeField ref={windowStartRef} label="Earliest departure" />
      <DateTimeField ref={windowEndRef} label="Latest departure" />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>Ride requested!</Text> : null}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Request ride</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  error: {
    color: '#c00',
    fontSize: 14,
  },
  success: {
    color: '#0a0',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
