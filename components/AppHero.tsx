import { StyleSheet, Text, View } from 'react-native';

const ACCENT = '#2E4BD6';

type ValueProp = {
  title: string;
  description: string;
};

const VALUE_PROPS: ValueProp[] = [
  {
    title: 'Your commute, matched locally',
    description: 'Carpool with coworkers already driving your route.',
  },
  {
    title: 'Private until matched',
    description: "Your contact info stays hidden until both sides confirm.",
  },
  {
    title: 'Split it, or swap turns instead',
    description: 'See a suggested cost split up front - many carpools just take turns driving instead of paying.',
  },
];

type Props = {
  // Sign-in (the second step) reuses just the wordmark so the brand carries
  // through without repeating the full pitch the city picker already made.
  compact?: boolean;
};

export default function AppHero({ compact = false }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <RouteMotif />
        <Text style={styles.wordmark}>Let's Carpool</Text>
      </View>

      {!compact ? (
        <>
          <Text style={styles.tagline}>Share the ride to work.</Text>
          <View style={styles.propsList}>
            {VALUE_PROPS.map((prop) => (
              <View key={prop.title} style={styles.propRow}>
                <View style={styles.propDot} />
                <View style={styles.propTextWrap}>
                  <Text style={styles.propTitle}>{prop.title}</Text>
                  <Text style={styles.propDescription}>{prop.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

// A dashed line between two dots - a lightweight nod to "commute" that
// doesn't need an icon library or image asset.
function RouteMotif() {
  return (
    <View style={styles.routeMotif}>
      <View style={styles.routeDot} />
      <View style={styles.routeLine} />
      <View style={[styles.routeDot, styles.routeDotEnd]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeMotif: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 30,
  },
  routeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  routeDotEnd: {
    opacity: 0.4,
  },
  routeLine: {
    flex: 1,
    height: 0,
    borderTopWidth: 1.5,
    borderTopColor: ACCENT,
    borderStyle: 'dashed',
    marginHorizontal: 4,
    opacity: 0.6,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
  },
  tagline: {
    fontSize: 16,
    fontWeight: '600',
    color: ACCENT,
    textAlign: 'center',
  },
  propsList: {
    width: '100%',
    gap: 12,
    marginTop: 10,
  },
  propRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  propDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: ACCENT,
    marginTop: 5,
  },
  propTextWrap: {
    flex: 1,
    gap: 1,
  },
  propTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
  },
  propDescription: {
    fontSize: 13,
    color: '#666',
  },
});
