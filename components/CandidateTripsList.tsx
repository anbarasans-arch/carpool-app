import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { trackError, trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';

const METERS_PER_MILE = 1609.344;

type Candidate = {
  trip_id: string;
  departure_time: string;
  seats_available: number;
  origin_distance_meters: number;
  destination_distance_meters: number;
};

type Props = {
  requestId: string;
};

// Shows nearby active trips for a ride request you posted, with a "Request
// this ride" action. Used both right after submitting a ride request
// (RequestRideScreen) and on-demand for an existing request (MyRidesScreen)
// - fetches its own data from `requestId` rather than taking pre-fetched
// candidates, so it works the same way in both places.
export default function CandidateTripsList({ requestId }: Props) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestedCosts, setRequestedCosts] = useState<Record<string, number>>({});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('find_candidate_trips', {
      request_id: requestId,
    });
    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      trackError('CandidateTripsList.load', rpcError.message, { requestId });
      return;
    }
    setCandidates(data ?? []);
    setRequestedCosts({});
  }

  async function handleRequestMatch(tripId: string) {
    const { data: inserted, error: matchError } = await supabase
      .from('matches')
      .insert({ trip_id: tripId, ride_request_id: requestId })
      .select('id, suggested_cost_split')
      .single();
    if (matchError) {
      setError(matchError.message);
      trackError('CandidateTripsList.handleRequestMatch', matchError.message, { requestId, tripId });
      return;
    }
    setRequestedCosts((prev) => ({ ...prev, [tripId]: inserted?.suggested_cost_split ?? 0 }));
    trackEvent('match_proposed');

    supabase.functions
      .invoke('notify-match', { body: { match_id: inserted.id, event: 'proposed' } })
      .catch(() => {});
  }

  if (loading) {
    return <ActivityIndicator style={styles.loading} />;
  }

  return (
    <View style={styles.candidates}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.candidatesTitle}>
        {!candidates || candidates.length === 0
          ? 'No matching trips yet - check back later.'
          : `${candidates.length} matching trip${candidates.length === 1 ? '' : 's'}:`}
      </Text>
      {(candidates ?? []).map((c) => (
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
          {c.trip_id in requestedCosts ? (
            <Text style={styles.requestedText}>
              Requested - waiting on driver. Suggested cost split: $
              {requestedCosts[c.trip_id].toFixed(2)}
            </Text>
          ) : (
            <Pressable style={styles.requestButton} onPress={() => handleRequestMatch(c.trip_id)}>
              <Text style={styles.requestButtonText}>Request this ride</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    marginTop: 8,
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
  error: {
    color: '#c00',
    fontSize: 14,
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
