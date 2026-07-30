import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import DateTimeField from './DateTimeField';
import LocationPicker from './LocationPicker';
import { supabase } from '../lib/supabase';
import type { GeocodeResult } from '../lib/geocode';

const METERS_PER_MILE = 1609.344;

type Candidate = {
  trip_id: string;
  departure_time: string;
  seats_available: number;
  origin_distance_meters: number;
  destination_distance_meters: number;
};

export default function RequestRideScreen() {
  const [origin, setOrigin] = useState<GeocodeResult | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestedTripIds, setRequestedTripIds] = useState<Set<string>>(new Set());
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
    const { data: inserted, error: insertError } = await supabase
      .from('ride_requests')
      .insert({
        rider_id: user.id,
        origin_point: `SRID=4326;POINT(${origin.lng} ${origin.lat})`,
        destination_point: `SRID=4326;POINT(${destination.lng} ${destination.lat})`,
        desired_time_start: new Date(windowStartValue).toISOString(),
        desired_time_end: new Date(windowEndValue).toISOString(),
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      setSubmitting(false);
      setError(insertError?.message ?? 'Could not save your request.');
      return;
    }

    const { data: matches, error: matchError } = await supabase.rpc('find_candidate_trips', {
      request_id: inserted.id,
    });
    setSubmitting(false);

    if (matchError) {
      setError(matchError.message);
      return;
    }

    setSuccess(true);
    setCandidates(matches ?? []);
    setRequestId(inserted.id);
    setRequestedTripIds(new Set());
    setOrigin(null);
    setDestination(null);
    if (windowStartRef.current) windowStartRef.current.value = '';
    if (windowEndRef.current) windowEndRef.current.value = '';
  }

  async function handleRequestMatch(tripId: string) {
    if (!requestId) return;
    const { error: matchError } = await supabase.from('matches').insert({
      trip_id: tripId,
      ride_request_id: requestId,
    });
    if (matchError) {
      setError(matchError.message);
      return;
    }
    setRequestedTripIds((prev) => new Set(prev).add(tripId));
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

      {candidates ? (
        <View style={styles.candidates}>
          <Text style={styles.candidatesTitle}>
            {candidates.length === 0
              ? 'No matching trips yet - check back later.'
              : `${candidates.length} matching trip${candidates.length === 1 ? '' : 's'}:`}
          </Text>
          {candidates.map((c) => (
            <View key={c.trip_id} style={styles.candidateRow}>
              <Text style={styles.candidateText}>
                {new Date(c.departure_time).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
              <Text style={styles.candidateSubtext}>
                {c.seats_available} seat{c.seats_available === 1 ? '' : 's'} available ·{' '}
                {(c.origin_distance_meters / METERS_PER_MILE).toFixed(1)} mi from your origin,{' '}
                {(c.destination_distance_meters / METERS_PER_MILE).toFixed(1)} mi from your destination
              </Text>
              {requestedTripIds.has(c.trip_id) ? (
                <Text style={styles.requestedText}>Requested - waiting on driver</Text>
              ) : (
                <Pressable style={styles.requestButton} onPress={() => handleRequestMatch(c.trip_id)}>
                  <Text style={styles.requestButtonText}>Request this ride</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      ) : null}
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
  candidates: {
    width: '100%',
    maxWidth: 480,
    gap: 12,
  },
  candidatesTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  candidateRow: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  candidateText: {
    fontSize: 14,
    fontWeight: '600',
  },
  candidateSubtext: {
    fontSize: 13,
    color: '#666',
  },
  requestButton: {
    backgroundColor: '#111',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  requestButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  requestedText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
  },
});
