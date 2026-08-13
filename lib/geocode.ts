import type { Region } from '../config/regions';

const LOCATIONIQ_KEY = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY!;

const MILES_PER_DEGREE_LAT = 69;

// Nominatim/LocationIQ viewbox order: left,top,right,bottom -
// i.e. west,north,east,south. Scoped to the given region's office so
// address search is ranked against where that city's trips are actually
// allowed (see supabase/migrations/20260812010000_add_regions.sql), rather
// than the whole planet - without this, a plain street address search has
// returned a same-named road in a different state or country ahead of the
// correct local match.
function viewboxForRegion(region: Region): string {
  const latOffset = region.radiusMiles / MILES_PER_DEGREE_LAT;
  const milesPerDegreeLng = MILES_PER_DEGREE_LAT * Math.cos((region.officeLat * Math.PI) / 180);
  const lngOffset = region.radiusMiles / milesPerDegreeLng;

  return [
    region.officeLng - lngOffset,
    region.officeLat + latOffset,
    region.officeLng + lngOffset,
    region.officeLat - latOffset,
  ].join(',');
}

export type GeocodeResult = {
  lat: number;
  lng: number;
  label: string;
};

// Both single-result search and multi-result live suggestions go through
// LocationIQ's /search (forward geocoding), not its dedicated
// /autocomplete endpoint - confirmed via LocationIQ's own docs and by
// testing directly that /autocomplete does not support viewbox/bounded at
// all (only countrycodes), while /search respects them correctly.
async function search(
  query: string,
  limit: number,
  region: Region,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const url = new URL('https://us1.locationiq.com/v1/search');
  url.searchParams.set('key', LOCATIONIQ_KEY);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('viewbox', viewboxForRegion(region));
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

export async function geocodeAddress(query: string, region: Region): Promise<GeocodeResult | null> {
  const [result] = await search(query, 1, region);
  return result ?? null;
}

export async function autocompleteAddress(
  query: string,
  region: Region,
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  return search(query, 5, region, signal);
}
