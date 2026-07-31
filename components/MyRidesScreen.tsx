import { useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../lib/supabase';

type Trip = {
  id: string;
  origin_label: string;
  destination_label: string;
  departure_time: string;
  seats_available: number;
  status: string;
};

type RideRequest = {
  id: string;
  origin_label: string;
  destination_label: string;
  desired_time_start: string;
  desired_time_end: string;
  status: string;
};

export default function MyRidesScreen() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        .select('id, origin_label, destination_label, departure_time, seats_available, status')
        .eq('driver_id', user.id)
        .order('departure_time', { ascending: false }),
      supabase
        .from('ride_requests')
        .select('id, origin_label, destination_label, desired_time_start, desired_time_end, status')
        .eq('rider_id', user.id)
        .order('desired_time_start', { ascending: false }),
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
          trips.map((t) => (
            <View key={t.id} style={styles.row}>
              <Text style={styles.rowTitle}>
                {t.origin_label} → {t.destination_label}
              </Text>
              <Text style={styles.rowSubtext}>
                {new Date(t.departure_time).toLocaleString()} · {t.seats_available} seat
                {t.seats_available === 1 ? '' : 's'} · {t.status}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My ride requests</Text>
        {rideRequests.length === 0 ? (
          <Text style={styles.empty}>You haven't requested any rides yet.</Text>
        ) : (
          rideRequests.map((r) => (
            <View key={r.id} style={styles.row}>
              <Text style={styles.rowTitle}>
                {r.origin_label} → {r.destination_label}
              </Text>
              <Text style={styles.rowSubtext}>
                {new Date(r.desired_time_start).toLocaleString()} - {new Date(r.desired_time_end).toLocaleTimeString()}{' '}
                · {r.status}
              </Text>
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
    gap: 4,
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
