// The list of cities this app supports. Add a city by adding an entry here,
// then ask Claude Code to run a migration to insert/update the matching row
// in the `regions` table (this file is the source of truth for the values;
// the DB copy is what the geofence trigger and matching queries actually
// enforce against, since that check has to hold server-side).
export type Region = {
  id: string;
  name: string;
  officeLat: number;
  officeLng: number;
  radiusMiles: number;
};

export const REGIONS: Region[] = [
  {
    id: 'dfw',
    name: 'Dallas–Fort Worth',
    officeLat: 32.9817475,
    officeLng: -97.1906054,
    radiusMiles: 80,
  },
  {
    id: 'durham',
    name: 'Durham, NC',
    // Anchored on Research Triangle Park (zip 27709 is a non-geographic
    // corporate mailing zip with no real coordinates of its own).
    officeLat: 35.8923773,
    officeLng: -78.8658899,
    radiusMiles: 80,
  },
  {
    id: 'merrimack',
    name: 'Merrimack, NH',
    officeLat: 42.8524398,
    officeLng: -71.5078474,
    radiusMiles: 80,
  },
];

export const DEFAULT_REGION_ID = REGIONS[0].id;

export function getRegion(id: string): Region | undefined {
  return REGIONS.find((r) => r.id === id);
}
