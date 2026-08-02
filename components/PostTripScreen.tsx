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
import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import type { GeocodeResult } from '../lib/geocode';

const METERS_PER_MILE = 1609.344;

type Candidate = {
  ride_request_id: string;
  desired_time_start: string;
  desired_time_end: string;
  origin_distance_meters: number;
  destination_distance_meters: number;
};

export default function PostTripScreen() {
  const [origin, setOrigin] = useState<GeocodeResult | null>(null);
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const [seats, setSeats] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [invitedCosts, setInvitedCosts] = useState<Record<string, number>>({});
  const [postedTripId, setPostedTripId] = useState<string | null>(null);
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
    const { data: inserted, error: insertError } = await supabase
      .from('trips')
      .insert({
        driver_id: user.id,
        origin_point: `SRID=4326;POINT(${origin.lng} ${origin.lat})`,
        destination_point: `SRID=4326;POINT(${destination.lng} ${destination.lat})`,
        origin_label: origin.label,
        destination_label: destination.label,
        departure_time: new Date(departureValue).toISOString(),
        seats_available: seatsNumber,
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      setSubmitting(false);
      setError(insertError?.message ?? 'Could not save your trip.');
      return;
    }

    const { data: riders, error: candidateError } = await supabase.rpc('find_candidate_riders', {
      trip_id: inserted.id,
    });
    setSubmitting(false);

    if (candidateError) {
      setError(candidateError.message);
      return;
    }

    trackEvent('trip_posted', { seats: seatsNumber });
    setSuccess(true);
    setPostedTripId(inserted.id);
    setCandidates(riders ?? []);
    setInvitedCosts({});
    setOrigin(null);
    setDestination(null);
    setSeats('1');
    if (departureRef.current) departureRef.current.value = '';
  }

  async function handleInviteRider(rideRequestId: string) {
    if (!postedTripId) return;
    const { data: inserted, error: matchError } = await supabase
      .from('matches')
      .insert({ trip_id: postedTripId, ride_request_id: rideRequestId })
      .select('id, suggested_cost_split')
      .single();
    if (matchError) {
      setError(matchError.message);
      return;
    }
    setInvitedCosts((prev) => ({ ...prev, [rideRequestId]: inserted?.suggested_cost_split ?? 0 }));
    trackEvent('match_proposed');

    supabase.functions
      .invoke('notify-match', { body: { match_id: inserted.id, event: 'proposed' } })
      .catch(() => {});
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

      {candidates ? (
        <View style={styles.candidates}>
          <Text style={styles.candidatesTitle}>
            {candidates.length === 0
              ? 'No open riders nearby yet - check back later.'
              : `${candidates.length} nearby rider${candidates.length === 1 ? '' : 's'} looking for a ride:`}
          </Text>
          {candidates.map((c) => (
            <View key={c.ride_request_id} style={styles.candidateRow}>
              <Text style={styles.candidateText}>
                {new Date(c.desired_time_start).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {' - '}
                {new Date(c.desired_time_end).toLocaleString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
              <Text style={styles.candidateSubtext}>
                {(c.origin_distance_meters / METERS_PER_MILE).toFixed(1)} mi from your origin,{' '}
                {(c.destination_distance_meters / METERS_PER_MILE).toFixed(1)} mi from your destination
              </Text>
              {c.ride_request_id in invitedCosts ? (
                <Text style={styles.requestedText}>
                  Invited - waiting on rider. Suggested cost split: $
                  {invitedCosts[c.ride_request_id].toFixed(2)}
                </Text>
              ) : (
                <Pressable
                  style={styles.requestButton}
                  onPress={() => handleInviteRider(c.ride_request_id)}
                >
                  <Text style={styles.requestButtonText}>Invite this rider</Text>
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
