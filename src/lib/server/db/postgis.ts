import { customType } from 'drizzle-orm/pg-core';
import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';

/**
 * PostGIS geography(Point, 4326) column.
 *
 * Drizzle's customType is DDL-only here. postgres-js returns hex EWKB on direct
 * reads and offers no native binding for GeoJSON inputs, so the TS data type is
 * declared as opaque `string`. Always read via `geoAsGeoJSON(col)` projection
 * and write via the SQL helpers below.
 */
export const geographyPoint = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'geography(Point, 4326)';
  }
});

export const geographyPolygon = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'geography(Polygon, 4326)';
  }
});

export type GeoJSONPoint = { type: 'Point'; coordinates: [number, number] };
export type GeoJSONPolygon = { type: 'Polygon'; coordinates: [number, number][][] };

/** SQL projection: returns the column's GeoJSON string. */
export function geoAsGeoJSON(col: SQLWrapper): SQL<string | null> {
  return sql<string | null>`ST_AsGeoJSON(${col})::text`;
}

/** SQL value: build a Point geography from {lon, lat}. */
export function pointFromLonLat(lon: number, lat: number): SQL {
  return sql`ST_GeogFromText(${`SRID=4326;POINT(${lon} ${lat})`})`;
}

/** SQL value: build a Polygon geography from a GeoJSON object. */
export function polygonFromGeoJSON(geojson: GeoJSONPolygon): SQL {
  return sql`ST_GeomFromGeoJSON(${JSON.stringify(geojson)})::geography`;
}

function isLonLat(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    typeof v[0] === 'number' &&
    typeof v[1] === 'number' &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1]) &&
    v[0] >= -180 &&
    v[0] <= 180 &&
    v[1] >= -90 &&
    v[1] <= 90
  );
}

export function parseGeoJSONPoint(raw: string | null | undefined): GeoJSONPoint | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { type?: unknown }).type !== 'Point' ||
    !isLonLat((parsed as { coordinates?: unknown }).coordinates)
  ) {
    return null;
  }
  return parsed as GeoJSONPoint;
}

export function parseGeoJSONPolygon(raw: string | null | undefined): GeoJSONPolygon | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { type?: unknown }).type !== 'Polygon'
  ) {
    return null;
  }
  const coords = (parsed as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coords) || coords.length === 0) return null;
  for (const ring of coords) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    for (const pt of ring) {
      if (!isLonLat(pt)) return null;
    }
    // GeoJSON spec: linear rings must close (first == last). PostGIS will
    // accept an unclosed ring via the spec, but downstream consumers
    // (centroid math, MapLibre fill rendering) silently glitch on the
    // mismatch.
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) return null;
  }
  return parsed as GeoJSONPolygon;
}
