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

import CandidateRidersList from './CandidateRidersList';
import LocationPicker from './LocationPicker';
import MultiDatePicker from './MultiDatePicker';
import TimeField from './TimeField';
import type { Region } from '../config/regions';
import { trackError, trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import type { GeocodeResult } from '../lib/geocode';

type Props = {
  region: Region;
};

export default function PostTripScreen({ region }: Props) {
  const [origin, setOrigin] = useState<GeocodeResult | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [seats, setSeats] = useState('1');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postedCount, setPostedCount] = useState<number | null>(null);
  const [postedTripId, setPostedTripId] = useState<string | null>(null);
  const departureTimeRef = useRef<any>(null);

  async function handleSubmit() {
    setError(null);
    setPostedCount(null);

    const departureTimeValue: string = departureTimeRef.current?.value ?? '';
    const seatsNumber = parseInt(seats, 10);

    if (!origin || !destination) {
      setError('Pick both an origin and a destination.');
      return;
    }
    if (selectedDates.length === 0) {
      setError('Pick at least one date you plan to drive.');
      return;
    }
    if (!departureTimeValue) {
      setError('Pick a departure time.');
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

    // One row per selected date, same route/time/seats - lets a driver who
    // carpools on a recurring but non-daily pattern (e.g. alternating weeks)
    // post the whole set in one go instead of repeating the form per day.
    const rows = selectedDates.map((dateKey) => ({
      driver_id: user.id,
      region_id: region.id,
      origin_point: `SRID=4326;POINT(${origin.lng} ${origin.lat})`,
      destination_point: `SRID=4326;POINT(${destination.lng} ${destination.lat})`,
      origin_label: origin.label,
      destination_label: destination.label,
      departure_time: new Date(`${dateKey}T${departureTimeValue}`).toISOString(),
      seats_available: seatsNumber,
    }));

    setSubmitting(true);
    const { data: inserted, error: insertError } = await supabase.from('trips').insert(rows).select('id');
    setSubmitting(false);

    if (insertError || !inserted) {
      const message = insertError?.message ?? 'Could not save your trip.';
      setError(message);
      trackError('PostTripScreen.handleSubmit', message, { seats: seatsNumber, dateCount: rows.length });
      return;
    }

    trackEvent('trip_posted', { seats: seatsNumber, dateCount: inserted.length });
    setPostedCount(inserted.length);
    setPostedTripId(inserted.length === 1 ? inserted[0].id : null);
    setOrigin(null);
    setDestination(null);
    setSeats('1');
    setSelectedDates([]);
    if (departureTimeRef.current) departureTimeRef.current.value = '';
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Post a trip</Text>

      <LocationPicker label="Origin" value={origin} onChange={setOrigin} region={region} />
      <LocationPicker label="Destination" value={destination} onChange={setDestination} region={region} />

      <TimeField ref={departureTimeRef} label="Departure time" />
      <MultiDatePicker
        label="Which days are you driving?"
        selectedDates={selectedDates}
        onChange={setSelectedDates}
      />

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
      {postedCount ? (
        <Text style={styles.success}>
          {postedCount === 1 ? 'Trip posted!' : `${postedCount} trips posted!`}
        </Text>
      ) : null}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            Post trip{selectedDates.length > 1 ? `s (${selectedDates.length})` : ''}
          </Text>
        )}
      </Pressable>

      {postedTripId ? <CandidateRidersList tripId={postedTripId} /> : null}
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
