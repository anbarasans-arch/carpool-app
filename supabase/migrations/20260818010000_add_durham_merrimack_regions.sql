-- Adds two new cities (config/regions.ts is the human-editable source of
-- truth - see that file's comment). Same 80mi radius as the original DFW
-- region for consistency.
--
-- Durham is anchored on Research Triangle Park (35.8923773, -78.8658899),
-- not a residential Durham address - the requested zip 27709 is a
-- non-geographic corporate mailing zip (RTP-associated) with no real
-- coordinates of its own, so RTP's actual landuse centroid is the closest
-- accurate real-world anchor.
insert into public.regions (id, name, office_point, radius_miles) values
  ('durham', 'Durham, NC', 'SRID=4326;POINT(-78.8658899 35.8923773)', 80),
  ('merrimack', 'Merrimack, NH', 'SRID=4326;POINT(-71.5078474 42.8524398)', 80);
