import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Region } from '../config/regions';
import { trackError } from '../lib/analytics';
import { autocompleteAddress, geocodeAddress, type GeocodeResult } from '../lib/geocode';

const MAPTILER_KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY!;

type Props = {
  label: string;
  value: GeocodeResult | null;
  onChange: (value: GeocodeResult) => void;
  region: Region;
};

export default function LocationPicker({ label, value, onChange, region }: Props) {
  // Default map center only - purely a UX convenience for where the map
  // opens zoomed to. NOT the geofence origin point; that's enforced
  // server-side against the selected region (see
  // supabase/migrations/20260812010000_add_regions.sql).
  const DEFAULT_CENTER: [number, number] = [region.officeLng, region.officeLat];
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const mapContainerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // The mount effect below only runs once, so it captures `value` at
  // mount time. If a search or click resolves before the async map load
  // finishes, that closure would be stale - read this ref instead so the
  // map picks up whatever the latest value actually is once it's ready.
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (Platform.OS !== 'web' || !mapContainerRef.current || mapRef.current) {
      return;
    }

    let cancelled = false;

    // Dynamic import so this never loads on native, where it would fail -
    // native map support is a follow-up (we're web-first for now).
    import('maplibre-gl').then((mod: any) => {
      if (cancelled || mapRef.current) return;

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

      const currentValue = valueRef.current;
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
        center: currentValue ? [currentValue.lng, currentValue.lat] : DEFAULT_CENTER,
        zoom: currentValue ? 13 : 10,
      });

      map.on('click', (e: any) => {
        setSelectedPoint(map, maplibregl, e.lngLat.lat, e.lngLat.lng, null);
      });

      mapRef.current = map;
      map.on('error', (e: any) => console.error('maplibre error', e?.error ?? e));

      if (currentValue) {
        markerRef.current = new maplibregl.Marker()
          .setLngLat([currentValue.lng, currentValue.lat])
          .addTo(map);
      }
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced address suggestions as the user types. 300ms + aborting the
  // previous in-flight request keeps this well under LocationIQ's free-tier
  // rate limit (2 req/sec) even while typing quickly.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 3 || query === valueRef.current?.label) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      autocompleteAddress(query.trim(), region, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setSuggestions(results);
            setShowSuggestions(true);
          }
        })
        .catch(() => {
          // Suggestions are best-effort - an aborted or failed request just
          // means no dropdown, not an error the user needs to see.
        });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function applyResult(result: GeocodeResult) {
    if (mapRef.current) {
      const mod: any = await import('maplibre-gl');
      const maplibregl = mod.default ?? mod;
      setSelectedPoint(mapRef.current, maplibregl, result.lat, result.lng, result.label);
    } else {
      onChange(result);
    }
  }

  async function handleSelectSuggestion(result: GeocodeResult) {
    setShowSuggestions(false);
    setSuggestions([]);
    setError(null);
    setQuery(result.label);
    await applyResult(result);
  }

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
    setShowSuggestions(false);
    setLoading(true);
    const result = await geocodeAddress(query.trim(), region);
    setLoading(false);

    if (!result) {
      setError('Could not find that address.');
      // Query text itself isn't sent - it's often a home/work address,
      // exactly the data this app is careful not to capture (see
      // PROJECT.md's privacy flag). Length only, as a rough usage signal.
      trackError('LocationPicker.handleSearch', 'geocode_not_found', { queryLength: query.trim().length });
      return;
    }

    await applyResult(result);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.searchRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Search an address"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            onFocus={() => {
              if (suggestions.length) setShowSuggestions(true);
            }}
            onBlur={() => {
              // Delay so a suggestion's onPress still registers before the
              // dropdown unmounts - blur fires first on both web and touch.
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            editable={!loading}
          />
          {showSuggestions && suggestions.length > 0 ? (
            <View style={styles.suggestions}>
              {suggestions.map((suggestion, index) => (
                <Pressable
                  key={`${suggestion.lat},${suggestion.lng},${index}`}
                  style={styles.suggestionItem}
                  onPress={() => handleSelectSuggestion(suggestion)}
                >
                  <Text style={styles.suggestionText} numberOfLines={1}>
                    {suggestion.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
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
    position: 'relative',
    zIndex: 20,
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  suggestions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    overflow: 'hidden',
    zIndex: 20,
    elevation: 20,
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  suggestionText: {
    fontSize: 13,
    color: '#333',
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
