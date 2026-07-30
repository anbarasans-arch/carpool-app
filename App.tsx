import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Session } from '@supabase/supabase-js';

import PostTripScreen from './components/PostTripScreen';
import SignInScreen from './components/SignInScreen';
import { supabase } from './lib/supabase';

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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
      <PostTripScreen />
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
});
