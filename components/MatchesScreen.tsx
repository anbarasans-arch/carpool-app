import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';

type MatchRow = {
  id: string;
  status: 'pending' | 'confirmed' | 'declined';
  proposed_by: string;
  suggested_cost_split: number | null;
  created_at: string;
  trips: { driver_id: string; departure_time: string } | null;
  ride_requests: { rider_id: string; desired_time_start: string; desired_time_end: string } | null;
};

export default function MatchesScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [contacts, setContacts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    const { data, error: fetchError } = await supabase
      .from('matches')
      .select(
        'id, status, proposed_by, suggested_cost_split, created_at, trips(driver_id, departure_time), ride_requests(rider_id, desired_time_start, desired_time_end)',
      )
      .order('created_at', { ascending: false })
      .returns<MatchRow[]>();

    setLoading(false);

    if (fetchError) {
      setError(fetchError.message);
      return;
    }

    const rows = data ?? [];
    setMatches(rows);

    const confirmedIds = rows.filter((m) => m.status === 'confirmed').map((m) => m.id);
    const entries = await Promise.all(
      confirmedIds.map(async (id) => {
        const { data: email } = await supabase.rpc('get_match_contact', { match_id: id });
        return [id, email as string | null] as const;
      }),
    );
    setContacts(Object.fromEntries(entries.filter(([, email]) => !!email)));
  }

  useEffect(() => {
    load();
  }, []);

  async function respond(matchId: string, status: 'confirmed' | 'declined') {
    const { error: updateError } = await supabase.from('matches').update({ status }).eq('id', matchId);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    trackEvent(status === 'confirmed' ? 'match_confirmed' : 'match_declined');

    if (status === 'confirmed') {
      // Best-effort notification - the confirmation itself is already
      // saved, so a failure here shouldn't surface as an error.
      supabase.functions
        .invoke('notify-match', { body: { match_id: matchId, event: 'confirmed' } })
        .catch(() => {});
    }

    load();
  }

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
      <Text style={styles.title}>My matches</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {matches.length === 0 ? (
        <Text style={styles.empty}>No matches yet.</Text>
      ) : (
        matches.map((m) => {
          const isDriver = m.trips?.driver_id === userId;
          const isProposer = m.proposed_by === userId;
          const role = isDriver
            ? 'You are driving'
            : isProposer
              ? 'You requested this ride'
              : 'A driver invited you to this ride';
          // Nothing flips a match's status when its trip's departure time
          // passes without a response - derive it here instead, same
          // approach as MyRidesScreen, rather than trusting a stale
          // "pending" that no longer means anything actionable.
          const isExpired =
            m.status === 'pending' && !!m.trips && new Date(m.trips.departure_time).getTime() < Date.now();
          const displayStatus = isExpired ? 'expired' : m.status;
          return (
            <View key={m.id} style={styles.row}>
              <Text style={styles.rowTitle}>{role}</Text>
              <Text style={styles.rowSubtext}>
                Status: {displayStatus}
                {m.trips ? ` · Departs ${new Date(m.trips.departure_time).toLocaleString()}` : ''}
              </Text>
              {m.suggested_cost_split != null ? (
                <Text style={styles.rowSubtext}>
                  Suggested cost split: ${m.suggested_cost_split.toFixed(2)} (each way, per rider)
                </Text>
              ) : null}
              {m.status === 'confirmed' && contacts[m.id] ? (
                <Text style={styles.contact}>Contact: {contacts[m.id]}</Text>
              ) : null}
              {m.status === 'pending' && !isProposer && !isExpired ? (
                <View style={styles.actions}>
                  <Pressable style={styles.confirmButton} onPress={() => respond(m.id, 'confirmed')}>
                    <Text style={styles.confirmButtonText}>Confirm</Text>
                  </Pressable>
                  <Pressable style={styles.declineButton} onPress={() => respond(m.id, 'declined')}>
                    <Text style={styles.declineButtonText}>Decline</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })
      )}
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
  empty: {
    fontSize: 14,
    color: '#666',
  },
  row: {
    width: '100%',
    maxWidth: 480,
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
  contact: {
    fontSize: 13,
    color: '#0a0',
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  confirmButton: {
    backgroundColor: '#111',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  declineButton: {
    borderWidth: 1,
    borderColor: '#c00',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  declineButtonText: {
    color: '#c00',
    fontSize: 13,
    fontWeight: '600',
  },
});
