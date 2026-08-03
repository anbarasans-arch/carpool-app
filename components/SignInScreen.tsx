import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { trackEvent } from '../lib/analytics';
import { requestOtp, supabase } from '../lib/supabase';

type Step = 'email' | 'code';

export default function SignInScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRequestCode() {
    setError(null);
    setLoading(true);
    const { error } = await requestOtp(email.trim());
    setLoading(false);

    if (error) {
      setError(error);
      return;
    }
    setStep('code');
  }

  async function handleVerifyCode() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    trackEvent('sign_in_completed');
  }

  if (step === 'email') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Enter your email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRequestCode}
          disabled={loading || !email}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send code</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter your code</Text>
      <Text style={styles.subtitle}>We sent a code to {email}</Text>
      <TextInput
        style={styles.input}
        placeholder="123456"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="number-pad"
        value={code}
        onChangeText={setCode}
        editable={!loading}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerifyCode}
        disabled={loading || !code}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Verify</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => {
          setStep('email');
          setCode('');
          setError(null);
        }}
        disabled={loading}
      >
        <Text style={styles.link}>Use a different email</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#c00',
    fontSize: 14,
    textAlign: 'center',
  },
  link: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    textDecorationLine: 'underline',
  },
});
