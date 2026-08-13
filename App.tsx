import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import CityPickerScreen from './components/CityPickerScreen';
import MatchesScreen from './components/MatchesScreen';
import MyRidesScreen from './components/MyRidesScreen';
import PostTripScreen from './components/PostTripScreen';
import RequestRideScreen from './components/RequestRideScreen';
import SignInScreen from './components/SignInScreen';
import { getRegion } from './config/regions';
import { identifyUser, resetAnalyticsUser, trackEvent } from './lib/analytics';
import { supabase } from './lib/supabase';

type Tab = 'post' | 'request' | 'matches' | 'rides';

const REGION_STORAGE_KEY = 'selectedRegionId';

// Lets email notifications deep-link straight to a tab, e.g.
// https://lets-carpool.com/?tab=matches - read once at mount, web only
// (native has no window/URL to read from).
function getInitialTab(): Tab {
  if (typeof window !== 'undefined' && window.location) {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested === 'post' || requested === 'request' || requested === 'matches' || requested === 'rides') {
      return requested;
    }
  }
  return 'post';
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [regionId, setRegionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(getInitialTab);
  const regionIdRef = useRef<string | null>(null);
  regionIdRef.current = regionId;

  function handleTabChange(nextTab: Tab) {
    setTab(nextTab);
    trackEvent('tab_viewed', { tab: nextTab });
  }

  function handleCitySelect(nextRegionId: string) {
    setRegionId(nextRegionId);
    AsyncStorage.setItem(REGION_STORAGE_KEY, nextRegionId).catch(() => {});
    trackEvent('region_selected', { region_id: nextRegionId });
    if (session) {
      supabase.rpc('set_home_region', { new_region_id: nextRegionId });
    }
  }

  useEffect(() => {
    async function init() {
      const { data } = await supabase.auth.getSession();
      const currentSession = data.session;
      setSession(currentSession);
      if (currentSession) {
        identifyUser(currentSession.user.id);
      }

      // Home region source of truth is the user's profile once signed in
      // (set once via set_home_region and reused across devices); local
      // storage is only the pre-sign-in / fallback source.
      let resolvedRegionId: string | null = null;
      let fromProfile = false;
      if (currentSession) {
        const { data: profile } = await supabase
          .from('users')
          .select('home_region_id')
          .eq('id', currentSession.user.id)
          .single();
        if (profile?.home_region_id) {
          resolvedRegionId = profile.home_region_id;
          fromProfile = true;
        }
      }
      if (!resolvedRegionId) {
        resolvedRegionId = await AsyncStorage.getItem(REGION_STORAGE_KEY);
      }
      if (resolvedRegionId) {
        setRegionId(resolvedRegionId);
        await AsyncStorage.setItem(REGION_STORAGE_KEY, resolvedRegionId);
        if (currentSession && !fromProfile) {
          supabase.rpc('set_home_region', { new_region_id: resolvedRegionId });
        }
      }

      setLoading(false);
    }

    init();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (nextSession) {
        identifyUser(nextSession.user.id);
        // Covers picking a city before signing in for the first time - the
        // profile row doesn't exist yet when handleCitySelect runs, so push
        // the local pick once a session actually appears.
        if (event === 'SIGNED_IN' && regionIdRef.current) {
          supabase.rpc('set_home_region', { new_region_id: regionIdRef.current });
        }
      } else {
        resetAnalyticsUser();
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <View style={styles.container} />;
  }

  if (!regionId) {
    return (
      <View style={styles.container}>
        <CityPickerScreen onSelect={handleCitySelect} />
        <StatusBar style="auto" />
      </View>
    );
  }

  const region = getRegion(regionId)!;

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
        <View>
          <Text style={styles.email}>{session.user.email}</Text>
          <Text style={styles.regionText}>{region.name}</Text>
        </View>
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
        <PostTripScreen region={region} />
      ) : tab === 'request' ? (
        <RequestRideScreen region={region} />
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
  regionText: {
    fontSize: 12,
    color: '#999',
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
