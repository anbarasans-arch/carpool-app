import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';

const METERS_PER_MILE = 1609.344;

type Candidate = {
  ride_request_id: string;
  desired_time_start: string;
  desired_time_end: string;
  origin_distance_meters: number;
  destination_distance_meters: number;
};

type Props = {
  tripId: string;
};

// Shows nearby open ride requests for a trip you're driving, with an
// "Invite this rider" action. Used both right after posting a trip
// (PostTripScreen) and on-demand for an existing trip (MyRidesScreen) -
// fetches its own data from `tripId` rather than taking pre-fetched
// candidates, so it works the same way in both places.
export default function CandidateRidersList({ tripId }: Props) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitedCosts, setInvitedCosts] = useState<Record<string, number>>({});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('find_candidate_riders', {
      trip_id: tripId,
    });
    setLoading(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setCandidates(data ?? []);
    setInvitedCosts({});
  }

  async function handleInviteRider(rideRequestId: string) {
    const { data: inserted, error: matchError } = await supabase
      .from('matches')
      .insert({ trip_id: tripId, ride_request_id: rideRequestId })
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

  if (loading) {
    return <ActivityIndicator style={styles.loading} />;
  }

  return (
    <View style={styles.candidates}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.candidatesTitle}>
        {!candidates || candidates.length === 0
          ? 'No open riders nearby yet - check back later.'
          : `${candidates.length} nearby rider${candidates.length === 1 ? '' : 's'} looking for a ride:`}
      </Text>
      {(candidates ?? []).map((c) => (
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
            <Pressable style={styles.requestButton} onPress={() => handleInviteRider(c.ride_request_id)}>
              <Text style={styles.requestButtonText}>Invite this rider</Text>
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
