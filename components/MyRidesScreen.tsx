import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import CandidateRidersList from './CandidateRidersList';
import CandidateTripsList from './CandidateTripsList';
import { supabase } from '../lib/supabase';

type Trip = {
  id: string;
  origin_label: string;
  destination_label: string;
  departure_time: string;
  seats_available: number;
  status: string;
  created_at: string;
};

type RideRequest = {
  id: string;
  origin_label: string;
  destination_label: string;
  desired_time_start: string;
  desired_time_end: string;
  status: string;
  created_at: string;
};

// Not-expired items first, then expired ones - within each group, newest
// (most recently posted) first. Expiration is derived from the time
// window, not the stored status column - nothing in this app proactively
// flips status when time passes, so status alone can't be trusted to know
// whether a trip/request is still current.
function sortByActiveThenNew<T extends { created_at: string }>(
  items: T[],
  isExpired: (item: T) => boolean,
): T[] {
  return [...items].sort((a, b) => {
    const expiredDiff = Number(isExpired(a)) - Number(isExpired(b));
    if (expiredDiff !== 0) return expiredDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function MyRidesScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTripId, setExpandedTripId] = useState<string | null>(null);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  async function load() {
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [tripsResult, requestsResult] = await Promise.all([
      supabase
        .from('trips')
        .select('id, origin_label, destination_label, departure_time, seats_available, status, created_at')
        .eq('driver_id', user.id),
      supabase
        .from('ride_requests')
        .select('id, origin_label, destination_label, desired_time_start, desired_time_end, status, created_at')
        .eq('rider_id', user.id),
    ]);

    setLoading(false);

    if (tripsResult.error) {
      setError(tripsResult.error.message);
      return;
    }
    if (requestsResult.error) {
      setError(requestsResult.error.message);
      return;
    }

    const now = Date.now();
    setTrips(
      sortByActiveThenNew(tripsResult.data ?? [], (t) => new Date(t.departure_time).getTime() < now),
    );
    setRideRequests(
      sortByActiveThenNew(requestsResult.data ?? [], (r) => new Date(r.desired_time_end).getTime() < now),
    );
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
    >
      <Text style={styles.title}>My rides</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trips I'm driving</Text>
        {trips.length === 0 ? (
          <Text style={styles.empty}>You haven't posted any trips yet.</Text>
        ) : (
          trips.map((t) => {
            const isExpired = new Date(t.departure_time).getTime() < Date.now();
            const displayStatus = isExpired && t.status === 'active' ? 'expired' : t.status;
            const canViewCandidates = !isExpired && t.status === 'active' && t.seats_available > 0;
            return (
              <View key={t.id} style={styles.row}>
                <Text style={styles.rowTitle}>
                  {t.origin_label} → {t.destination_label}
                </Text>
                <Text style={styles.rowSubtext}>
                  {new Date(t.departure_time).toLocaleString()} · {t.seats_available} seat
                  {t.seats_available === 1 ? '' : 's'} · {displayStatus}
                </Text>
                {canViewCandidates ? (
                  <Pressable
                    style={styles.viewButton}
                    onPress={() => setExpandedTripId(expandedTripId === t.id ? null : t.id)}
                  >
                    <Text style={styles.viewButtonText}>
                      {expandedTripId === t.id ? 'Hide candidates' : 'View candidates'}
                    </Text>
                  </Pressable>
                ) : null}
                {expandedTripId === t.id ? <CandidateRidersList tripId={t.id} /> : null}
              </View>
            );
          })
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My ride requests</Text>
        {rideRequests.length === 0 ? (
          <Text style={styles.empty}>You haven't requested any rides yet.</Text>
        ) : (
          rideRequests.map((r) => {
            const isExpired = new Date(r.desired_time_end).getTime() < Date.now();
            const displayStatus = isExpired && r.status === 'open' ? 'expired' : r.status;
            const canViewCandidates = !isExpired && r.status === 'open';
            return (
              <View key={r.id} style={styles.row}>
                <Text style={styles.rowTitle}>
                  {r.origin_label} → {r.destination_label}
                </Text>
                <Text style={styles.rowSubtext}>
                  {new Date(r.desired_time_start).toLocaleString()} -{' '}
                  {new Date(r.desired_time_end).toLocaleTimeString()} · {displayStatus}
                </Text>
                {canViewCandidates ? (
                  <Pressable
                    style={styles.viewButton}
                    onPress={() => setExpandedRequestId(expandedRequestId === r.id ? null : r.id)}
                  >
                    <Text style={styles.viewButtonText}>
                      {expandedRequestId === r.id ? 'Hide candidates' : 'View candidates'}
                    </Text>
                  </Pressable>
                ) : null}
                {expandedRequestId === r.id ? <CandidateTripsList requestId={r.id} /> : null}
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
  },
  error: {
    color: '#c00',
    fontSize: 14,
  },
  section: {
    width: '100%',
    maxWidth: 480,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    fontSize: 14,
    color: '#666',
  },
  row: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowSubtext: {
    fontSize: 13,
    color: '#666',
  },
  viewButton: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  viewButtonText: {
    color: '#111',
    fontSize: 13,
    fontWeight: '600',
  },
});
