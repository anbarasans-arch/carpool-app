import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import CandidateRidersList from './CandidateRidersList';
import CandidateTripsList from './CandidateTripsList';
import { trackError } from '../lib/analytics';
import { groupByDate } from '../lib/dateGroups';
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

function toggleId(ids: Set<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export default function MyRidesScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTripIds, setExpandedTripIds] = useState<Set<string>>(new Set());
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(new Set());

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
      trackError('MyRidesScreen.load.trips', tripsResult.error.message);
      return;
    }
    if (requestsResult.error) {
      setError(requestsResult.error.message);
      trackError('MyRidesScreen.load.rideRequests', requestsResult.error.message);
      return;
    }

    setTrips(tripsResult.data ?? []);
    setRideRequests(requestsResult.data ?? []);
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

  const tripGroups = groupByDate(
    trips,
    (t) => t.departure_time,
    (t) => t.created_at,
  );
  const requestGroups = groupByDate(
    rideRequests,
    (r) => r.desired_time_start,
    (r) => r.created_at,
  );

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
          tripGroups.map((group) => (
            <View key={group.dateKey} style={styles.dateGroup}>
              <Text style={styles.dateLabel}>{group.dateLabel}</Text>
              {group.items.map((t) => {
                const isExpired = new Date(t.departure_time).getTime() < Date.now();
                const displayStatus = isExpired && t.status === 'active' ? 'expired' : t.status;
                const canViewCandidates = !isExpired && t.status === 'active' && t.seats_available > 0;
                const isOpen = expandedTripIds.has(t.id);
                return (
                  <View key={t.id} style={styles.card}>
                    <Pressable
                      style={styles.cardHeader}
                      onPress={() => setExpandedTripIds((prev) => toggleId(prev, t.id))}
                    >
                      <View style={styles.cardHeaderText}>
                        <Text style={styles.rowTitle}>
                          {t.origin_label} → {t.destination_label}
                        </Text>
                        <Text style={styles.rowSubtext}>
                          {new Date(t.departure_time).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}{' '}
                          · {displayStatus}
                        </Text>
                      </View>
                      <Text style={styles.toggle}>{isOpen ? '−' : '+'}</Text>
                    </Pressable>
                    {isOpen ? (
                      <View style={styles.cardDetails}>
                        <Text style={styles.rowSubtext}>
                          {t.seats_available} seat{t.seats_available === 1 ? '' : 's'} available
                        </Text>
                        {canViewCandidates ? <CandidateRidersList tripId={t.id} /> : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My ride requests</Text>
        {rideRequests.length === 0 ? (
          <Text style={styles.empty}>You haven't requested any rides yet.</Text>
        ) : (
          requestGroups.map((group) => (
            <View key={group.dateKey} style={styles.dateGroup}>
              <Text style={styles.dateLabel}>{group.dateLabel}</Text>
              {group.items.map((r) => {
                const isExpired = new Date(r.desired_time_end).getTime() < Date.now();
                const displayStatus = isExpired && r.status === 'open' ? 'expired' : r.status;
                const canViewCandidates = !isExpired && r.status === 'open';
                const isOpen = expandedRequestIds.has(r.id);
                return (
                  <View key={r.id} style={styles.card}>
                    <Pressable
                      style={styles.cardHeader}
                      onPress={() => setExpandedRequestIds((prev) => toggleId(prev, r.id))}
                    >
                      <View style={styles.cardHeaderText}>
                        <Text style={styles.rowTitle}>
                          {r.origin_label} → {r.destination_label}
                        </Text>
                        <Text style={styles.rowSubtext}>
                          {new Date(r.desired_time_start).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}{' '}
                          - {new Date(r.desired_time_end).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}{' '}
                          · {displayStatus}
                        </Text>
                      </View>
                      <Text style={styles.toggle}>{isOpen ? '−' : '+'}</Text>
                    </Pressable>
                    {isOpen && canViewCandidates ? (
                      <View style={styles.cardDetails}>
                        <CandidateTripsList requestId={r.id} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))
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
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    fontSize: 14,
    color: '#666',
  },
  dateGroup: {
    gap: 6,
  },
  dateLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    gap: 8,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardDetails: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  toggle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111',
    width: 24,
    textAlign: 'center',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  rowSubtext: {
    fontSize: 13,
    color: '#666',
  },
});
