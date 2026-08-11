const LOCATIONIQ_KEY = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY!;

// Same office reference point as the DB geofence (see
// supabase/migrations/20260731021429_geofence_validation.sql, widened to
// 80mi in 20260803030000) - reused here so search results are scoped to
// the same region trips are actually allowed in, rather than ranked
// against the whole planet. Without this, a plain street address search
// has returned a same-named road in Georgia, Alberta, London, and Madeira
// ahead of the correct Dallas-area match - global text-similarity ranking
// doesn't know "closest to where this app operates."
const OFFICE_LAT = 32.9817475;
const OFFICE_LNG = -97.1906054;
const SEARCH_RADIUS_MILES = 80;
const MILES_PER_DEGREE_LAT = 69;

const latOffset = SEARCH_RADIUS_MILES / MILES_PER_DEGREE_LAT;
const milesPerDegreeLng = MILES_PER_DEGREE_LAT * Math.cos((OFFICE_LAT * Math.PI) / 180);
const lngOffset = SEARCH_RADIUS_MILES / milesPerDegreeLng;

// Nominatim/LocationIQ viewbox order: left,top,right,bottom -
// i.e. west,north,east,south.
const VIEWBOX = [
  OFFICE_LNG - lngOffset,
  OFFICE_LAT + latOffset,
  OFFICE_LNG + lngOffset,
  OFFICE_LAT - latOffset,
].join(',');

export type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
};

// Both single-result search and multi-result live suggestions go through
// LocationIQ's /search (forward geocoding), not its dedicated
// /autocomplete endpoint - confirmed via LocationIQ's own docs and by
// testing directly that /autocomplete does not support viewbox/bounded at
// all (only countrycodes), while /search respects them correctly. Without
// bounded=1, autocomplete kept the Georgia/Canada/UK results ranked above
// the right one even with a viewbox hint; /search enforces it properly.
async function search(query: string, limit: number, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const url = new URL('https://us1.locationiq.com/v1/search');
  url.searchParams.set('key', LOCATIONIQ_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('viewbox', VIEWBOX);
  url.searchParams.set('bounded', '1');
  url.searchParams.set('countrycodes', 'us');

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

export async function geocodeAddress(query: string): Promise<GeocodeResult | null> {
  const [result] = await search(query, 1);
  return result ?? null;
}

export async function autocompleteAddress(
  query: string,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  return search(query, 5, signal);
}
