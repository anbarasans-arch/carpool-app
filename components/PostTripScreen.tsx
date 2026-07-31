import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import DateTimeField from './DateTimeField';
import LocationPicker from './LocationPicker';
import { supabase } from '../lib/supabase';
import type { GeocodeResult } from '../lib/geocode';

export default function PostTripScreen() {
  const [origin, setOrigin] = useState<GeocodeResult | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [seats, setSeats] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const departureRef = useRef<any>(null);

  async function handleSubmit() {
    setError(null);

    const departureValue: string = departureRef.current?.value ?? '';
    const seatsNumber = parseInt(seats, 10);

    if (!origin || !destination) {
      setError('Pick both an origin and a destination.');
      return;
    }
    if (!departureValue) {
      setError('Pick a departure date and time.');
      return;
    }
    if (!Number.isInteger(seatsNumber) || seatsNumber < 1) {
      setError('Seats must be a whole number of at least 1.');
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
    const { error: insertError } = await supabase.from('trips').insert({
      driver_id: user.id,
      origin_point: `SRID=4326;POINT(${origin.lng} ${origin.lat})`,
      destination_point: `SRID=4326;POINT(${destination.lng} ${destination.lat})`,
      origin_label: origin.label,
      destination_label: destination.label,
      departure_time: new Date(departureValue).toISOString(),
      seats_available: seatsNumber,
    });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSuccess(true);
    setOrigin(null);
    setDestination(null);
    setSeats('1');
    if (departureRef.current) departureRef.current.value = '';
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Post a trip</Text>

      <LocationPicker label="Origin" value={origin} onChange={setOrigin} />
      <LocationPicker label="Destination" value={destination} onChange={setDestination} />

      <DateTimeField ref={departureRef} label="Departure date & time" />

      <View style={styles.field}>
        <Text style={styles.label}>Seats available</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={seats}
          onChangeText={setSeats}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>Trip posted!</Text> : null}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Post trip</Text>}
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
  field: {
    width: '100%',
    maxWidth: 480,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
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
