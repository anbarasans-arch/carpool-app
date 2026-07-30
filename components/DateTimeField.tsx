import { forwardRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

type Props = {
  label: string;
};

const DateTimeField = forwardRef<any, Props>(function DateTimeField({ label }, ref) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {Platform.OS === 'web' ? (
        // @ts-expect-error - raw DOM element, web only
        <input ref={ref} type="datetime-local" style={webInputStyle} />
      ) : (
        <Text style={styles.nativeFallback}>Date/time picker is available on web for now.</Text>
      )}
    </View>
  );
});

export default DateTimeField;

const webInputStyle: any = {
  width: '100%',
  maxWidth: 480,
  borderWidth: 1,
  borderColor: '#ccc',
  borderRadius: 8,
  padding: 10,
  fontSize: 14,
  fontFamily: 'inherit',
};

const styles = StyleSheet.create({
  field: {
    width: '100%',
    maxWidth: 480,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  nativeFallback: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
});
