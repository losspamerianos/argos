import { customType } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';

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
export function geoAsGeoJSON(col: unknown): SQL<string | null> {
  return sql<string | null>`ST_AsGeoJSON(${col as never})::text`;
}

/** SQL value: build a Point geography from {lon, lat}. */
export function pointFromLonLat(lon: number, lat: number): SQL {
  return sql`ST_GeogFromText(${`SRID=4326;POINT(${lon} ${lat})`})`;
}

/** SQL value: build a Polygon geography from a GeoJSON object. */
export function polygonFromGeoJSON(geojson: GeoJSONPolygon): SQL {
  return sql`ST_GeomFromGeoJSON(${JSON.stringify(geojson)})::geography`;
}

export function parseGeoJSONPoint(raw: string | null | undefined): GeoJSONPoint | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GeoJSONPoint;
  } catch {
    return null;
  }
}

export function parseGeoJSONPolygon(raw: string | null | undefined): GeoJSONPolygon | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GeoJSONPolygon;
  } catch {
    return null;
  }
}
