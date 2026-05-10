import { customType } from 'drizzle-orm/pg-core';

type GeoJSONPolygon = {
  type: 'Polygon';
  coordinates: [number, number][][];
};

/**
 * PostGIS geography(Point, 4326).
 * Reads/writes go through raw SQL helpers (ST_AsGeoJSON / ST_GeogFromText) since
 * postgres.js returns hex EWKB for geography by default. The custom type only
 * carries the column DDL and the in-memory shape.
 */
export const geographyPoint = customType<{
  data: { lon: number; lat: number };
  driverData: string;
}>({
  dataType() {
    return 'geography(Point, 4326)';
  }
});

/**
 * PostGIS geography(Polygon, 4326). Same caveat: convert via raw SQL helpers.
 */
export const geographyPolygon = customType<{
  data: GeoJSONPolygon;
  driverData: string;
}>({
  dataType() {
    return 'geography(Polygon, 4326)';
  }
});
