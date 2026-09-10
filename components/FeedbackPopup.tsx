import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { trackError, trackEvent } from '../lib/analytics';
import { supabase } from '../lib/supabase';

const MAX_WORDS = 1500;

type Props = {
  visible: boolean;
  onClose: () => void;
};

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export default function FeedbackPopup({ visible, onClose }: Props) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const wordCount = countWords(message);
  const overLimit = wordCount > MAX_WORDS;

  function handleClose() {
    setMessage('');
    setError(null);
    setSubmitted(false);
    onClose();
  }

  async function handleSubmit() {
    if (!message.trim() || overLimit) return;

    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('You must be signed in.');
      return;
    }

    setSubmitting(true);
    const { error: insertError } = await supabase
      .from('feedback')
      .insert({ user_id: user.id, message: message.trim() });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      trackError('FeedbackPopup.handleSubmit', insertError.message);
      return;
    }

    trackEvent('feedback_submitted', { wordCount });
    setSubmitted(true);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {submitted ? (
            <>
              <Text style={styles.title}>Thanks for the feedback!</Text>
              <Text style={styles.subtitle}>It's been sent straight to the team building this app.</Text>
              <Pressable style={styles.doneButton} onPress={handleClose}>
                <Text style={styles.doneButtonText}>Done</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.title}>Got a minute for feedback?</Text>
              <Text style={styles.subtitle}>
                Totally optional - tell us what's working, what's not, or what you wish this app did.
              </Text>
              <TextInput
                style={styles.input}
                multiline
                placeholder="Type your feedback here..."
                value={message}
                onChangeText={setMessage}
                editable={!submitting}
              />
              <Text style={[styles.wordCount, overLimit && styles.wordCountOver]}>
                {wordCount} / {MAX_WORDS} words
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.actions}>
                <Pressable style={styles.dismissButton} onPress={handleClose} disabled={submitting}>
                  <Text style={styles.dismissButtonText}>Not now</Text>
                </Pressable>
                <Pressable
                  style={[styles.submitButton, (!message.trim() || overLimit) && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting || !message.trim() || overLimit}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Send feedback</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  wordCount: {
    fontSize: 11,
    color: '#999',
    textAlign: 'right',
  },
  wordCountOver: {
    color: '#c00',
    fontWeight: '600',
  },
  error: {
    color: '#c00',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  dismissButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dismissButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
