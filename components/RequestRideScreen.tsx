import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import CandidateTripsList from './CandidateTripsList';
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

export default function RequestRideScreen({ region }: Props) {
  const [origin, setOrigin] = useState<GeocodeResult | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postedCount, setPostedCount] = useState<number | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const windowStartRef = useRef<any>(null);
  const windowEndRef = useRef<any>(null);

  async function handleSubmit() {
    setError(null);
    setPostedCount(null);

    const windowStartValue: string = windowStartRef.current?.value ?? '';
    const windowEndValue: string = windowEndRef.current?.value ?? '';

    if (!origin || !destination) {
      setError('Pick both an origin and a destination.');
      return;
    }
    if (selectedDates.length === 0) {
      setError('Pick at least one date you need a ride.');
      return;
    }
    if (!windowStartValue || !windowEndValue) {
      setError('Pick your earliest and latest departure time.');
      return;
    }
    if (windowEndValue <= windowStartValue) {
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

    // One row per selected date, same route/window - lets a rider who needs
    // a ride on a recurring but non-daily pattern (e.g. alternating weeks)
    // submit the whole set in one go instead of repeating the form per day.
    const rows = selectedDates.map((dateKey) => ({
      rider_id: user.id,
      region_id: region.id,
      origin_point: `SRID=4326;POINT(${origin.lng} ${origin.lat})`,
      destination_point: `SRID=4326;POINT(${destination.lng} ${destination.lat})`,
      origin_label: origin.label,
      destination_label: destination.label,
      desired_time_start: new Date(`${dateKey}T${windowStartValue}`).toISOString(),
      desired_time_end: new Date(`${dateKey}T${windowEndValue}`).toISOString(),
    }));

    setSubmitting(true);
    const { data: inserted, error: insertError } = await supabase
      .from('ride_requests')
      .insert(rows)
      .select('id');
    setSubmitting(false);

    if (insertError || !inserted) {
      const message = insertError?.message ?? 'Could not save your request.';
      setError(message);
      trackError('RequestRideScreen.handleSubmit', message, { dateCount: rows.length });
      return;
    }

    trackEvent('ride_requested', { dateCount: inserted.length });
    setPostedCount(inserted.length);
    setRequestId(inserted.length === 1 ? inserted[0].id : null);
    setOrigin(null);
    setDestination(null);
    setSelectedDates([]);
    if (windowStartRef.current) windowStartRef.current.value = '';
    if (windowEndRef.current) windowEndRef.current.value = '';
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Request a ride</Text>

      <LocationPicker label="Origin" value={origin} onChange={setOrigin} region={region} />
      <LocationPicker label="Destination" value={destination} onChange={setDestination} region={region} />

      <TimeField ref={windowStartRef} label="Earliest departure" />
      <TimeField ref={windowEndRef} label="Latest departure" />
      <MultiDatePicker
        label="Which days do you need a ride?"
        selectedDates={selectedDates}
        onChange={setSelectedDates}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {postedCount ? (
        <Text style={styles.success}>
          {postedCount === 1 ? 'Ride requested!' : `${postedCount} ride requests posted!`}
        </Text>
      ) : null}

      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            Request ride{selectedDates.length > 1 ? `s (${selectedDates.length})` : ''}
          </Text>
        )}
      </Pressable>

      {requestId ? <CandidateTripsList requestId={requestId} /> : null}
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
