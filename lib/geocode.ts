const LOCATIONIQ_KEY = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY!;

export type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
};

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const url = new URL('https://us1.locationiq.com/v1/search');
  url.searchParams.set('key', LOCATIONIQ_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  const response = await fetch(url.toString());
  if (!response.ok) {
    return null;
  }

  const results = await response.json();
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const [result] = results;
  return {
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    label: result.display_name,
  };
}

export async function autocompleteAddress(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const url = new URL('https://api.locationiq.com/v1/autocomplete');
  url.searchParams.set('key', LOCATIONIQ_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');

  const response = await fetch(url.toString(), { signal });
  if (!response.ok) {
    return [];
  }

  const results = await response.json();
  if (!Array.isArray(results)) {
    return [];
  }

  return results.map((result: any) => ({
    lat: parseFloat(result.lat),
    lng: parseFloat(result.lon),
    label: result.display_name,
  }));
}
