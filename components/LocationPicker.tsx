import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { geocodeAddress, type GeocodeResult } from '../lib/geocode';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY!;

// Default map center only - purely a UX convenience for where the map opens
// zoomed to. NOT the geofence origin point; the 50mi radius check (Phase 2,
// see FOLLOWUPS.md) will need the office's real coordinates from the user.
const DEFAULT_CENTER: [number, number] = [-96.797, 32.7767]; // downtown Dallas

type Props = {
  label: string;
  value: GeocodeResult | null;
  onChange: (value: GeocodeResult) => void;
};

export default function LocationPicker({ label, value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapContainerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !mapContainerRef.current || mapRef.current) {
      return;
    }

    // Dynamic import so this never loads on native, where it would fail -
    // native map support is a follow-up (we're web-first for now).
    import('maplibre-gl').then((mod: any) => {
      if (mapRef.current) return;

      // Metro's ESM interop doesn't consistently populate `.default` here,
      // so fall back to the named exports either way.
      const maplibregl = mod.default ?? mod;

      if (!document.getElementById('maplibre-gl-css')) {
        const link = document.createElement('link');
        link.id = 'maplibre-gl-css';
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/maplibre-gl@6/dist/maplibre-gl.css';
        document.head.appendChild(link);
      }

      // Metro serves maplibre-gl's own worker chunk as an HTML 404 page
      // instead of the real script, so the map silently never loads (no
      // error event - just stuck). Point it at a matching CDN copy instead.
      maplibregl.setWorkerUrl('https://unpkg.com/maplibre-gl@6/dist/maplibre-gl-worker.mjs');

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
        center: value ? [value.lng, value.lat] : DEFAULT_CENTER,
        zoom: value ? 13 : 10,
      });

      map.on('click', (e: any) => {
        setSelectedPoint(map, maplibregl, e.lngLat.lat, e.lngLat.lng, null);
      });

      mapRef.current = map;
      map.on('error', (e: any) => console.error('maplibre error', e?.error ?? e));

      if (value) {
        markerRef.current = new maplibregl.Marker().setLngLat([value.lng, value.lat]).addTo(map);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setSelectedPoint(
    map: any,
    maplibregl: any,
    lat: number,
    lng: number,
    label: string | null,
  ) {
    map.flyTo({ center: [lng, lat], zoom: 13 });
    if (markerRef.current) {
      markerRef.current.setLngLat([lng, lat]);
    } else {
      markerRef.current = new maplibregl.Marker().setLngLat([lng, lat]).addTo(map);
    }
    onChange({ lat, lng, label: label ?? `Dropped pin (${lat.toFixed(4)}, ${lng.toFixed(4)})` });
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setError(null);
    setLoading(true);
    const result = await geocodeAddress(query.trim());
    setLoading(false);

    if (!result) {
      setError('Could not find that address.');
      return;
    }

    if (mapRef.current) {
      const mod: any = await import('maplibre-gl');
      const maplibregl = mod.default ?? mod;
      setSelectedPoint(mapRef.current, maplibregl, result.lat, result.lng, result.label);
    } else {
      onChange(result);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          placeholder="Search an address"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          editable={!loading}
        />
        <Pressable style={styles.searchButton} onPress={handleSearch} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchButtonText}>Search</Text>}
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {value ? <Text style={styles.selected}>{value.label}</Text> : null}
      {Platform.OS === 'web' ? (
        <View ref={mapContainerRef} style={styles.map} />
      ) : (
        <Text style={styles.nativeFallback}>Map picker is available on web for now.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 480,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  searchButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  error: {
    color: '#c00',
    fontSize: 13,
  },
  selected: {
    fontSize: 13,
    color: '#666',
  },
  map: {
    width: '100%',
    height: 240,
    borderRadius: 8,
    overflow: 'hidden',
  },
  nativeFallback: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
});
