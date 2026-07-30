import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import PostTripScreen from './components/PostTripScreen';
import RequestRideScreen from './components/RequestRideScreen';
import SignInScreen from './components/SignInScreen';
import { supabase } from './lib/supabase';

type Tab = 'post' | 'request';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('post');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <View style={styles.container} />;
  }

  if (!session) {
    return (
      <View style={styles.container}>
        <SignInScreen />
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <View style={styles.appContainer}>
      <View style={styles.header}>
        <Text style={styles.email}>{session.user.email}</Text>
        <Pressable onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('post')}>
          <Text style={[styles.tabText, tab === 'post' && styles.tabTextActive]}>Post a trip</Text>
        </Pressable>
        <Pressable onPress={() => setTab('request')}>
          <Text style={[styles.tabText, tab === 'request' && styles.tabTextActive]}>Request a ride</Text>
        </Pressable>
      </View>
      {tab === 'post' ? <PostTripScreen /> : <RequestRideScreen />}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  appContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  email: {
    fontSize: 14,
    color: '#666',
  },
  signOutText: {
    fontSize: 14,
    color: '#c00',
    textDecorationLine: 'underline',
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 12,
  },
  tabText: {
    fontSize: 15,
    color: '#999',
    paddingBottom: 4,
  },
  tabTextActive: {
    color: '#111',
    fontWeight: '600',
    borderBottomWidth: 2,
    borderBottomColor: '#111',
  },
});
