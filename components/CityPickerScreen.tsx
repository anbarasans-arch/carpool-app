import { Pressable, StyleSheet, Text, View } from 'react-native';

import { REGIONS } from '../config/regions';

type Props = {
  onSelect: (regionId: string) => void;
};

// First screen the app shows (before sign-in) when no city has been chosen
// yet. The list of cities is config/regions.ts - add a city there (plus a
// matching migration, see that file's comment) and it shows up here with no
// other code changes.
export default function CityPickerScreen({ onSelect }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Where do you carpool?</Text>
      <Text style={styles.subtitle}>Pick your city to get started.</Text>
      <View style={styles.list}>
        {REGIONS.map((region) => (
          <Pressable key={region.id} style={styles.option} onPress={() => onSelect(region.id)}>
            <Text style={styles.optionText}>{region.name}</Text>
          </Pressable>
        ))}
      </View>
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
  list: {
    width: '100%',
    maxWidth: 320,
    gap: 10,
  },
  option: {
    width: '100%',
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  optionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
