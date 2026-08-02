import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import MatchesScreen from './components/MatchesScreen';
import MyRidesScreen from './components/MyRidesScreen';
import PostTripScreen from './components/PostTripScreen';
import RequestRideScreen from './components/RequestRideScreen';
import SignInScreen from './components/SignInScreen';
import { identifyUser, resetAnalyticsUser, trackEvent } from './lib/analytics';
import { supabase } from './lib/supabase';

type Tab = 'post' | 'request' | 'matches' | 'rides';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('post');

  function handleTabChange(nextTab: Tab) {
    setTab(nextTab);
    trackEvent('tab_viewed', { tab: nextTab });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        identifyUser(session.user.id);
      } else {
        resetAnalyticsUser();
      }
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
      >
        <Pressable onPress={() => handleTabChange('post')}>
          <Text style={[styles.tabText, tab === 'post' && styles.tabTextActive]}>Post a trip</Text>
        </Pressable>
        <Pressable onPress={() => handleTabChange('request')}>
          <Text style={[styles.tabText, tab === 'request' && styles.tabTextActive]}>Request a ride</Text>
        </Pressable>
        <Pressable onPress={() => handleTabChange('matches')}>
          <Text style={[styles.tabText, tab === 'matches' && styles.tabTextActive]}>My matches</Text>
        </Pressable>
        <Pressable onPress={() => handleTabChange('rides')}>
          <Text style={[styles.tabText, tab === 'rides' && styles.tabTextActive]}>My rides</Text>
        </Pressable>
      </ScrollView>
      {tab === 'post' ? (
        <PostTripScreen />
      ) : tab === 'request' ? (
        <RequestRideScreen />
      ) : tab === 'matches' ? (
        <MatchesScreen />
      ) : (
        <MyRidesScreen />
      )}
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
  tabsScroll: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexGrow: 1,
    gap: 20,
    paddingHorizontal: 16,
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
