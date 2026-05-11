import { parseGeoJSONPoint } from '../db/postgis';
import type {
  Feature,
  FeatureCollection,
  GeoPoint,
  SightingFeatureProperties,
  SiteFeatureProperties,
  SiteLifecycleState
} from '$lib/types/api';

/** Row shape produced by the sites SELECT in `routes/api/o/.../sites/+server.ts`. */
export type SiteRow = {
  id: string;
  name: string;
  kind: string;
  lifecycleState: string;
  sectorId: string | null;
  attributes: Record<string, unknown> | null;
  createdAt: Date;
  pointGeoJSON: string | null;
};

/** Row shape produced by the sightings SELECT. */
export type SightingRow = {
  id: string;
  ts: Date;
  siteId: string | null;
  description: string | null;
  attributes: Record<string, unknown> | null;
  pointGeoJSON: string | null;
};

export function siteRowToFeature(row: SiteRow): Feature<SiteFeatureProperties> {
  return {
    type: 'Feature',
    id: row.id,
    geometry: parsePoint(row.pointGeoJSON),
    properties: {
      // Mirror the row id into properties so MapLibre's `promoteId:'id'`
      // can recover it as the feature id at hit-test time. (Top-level
      // `Feature.id` is silently dropped for non-integer values.)
      id: row.id,
      name: row.name,
      kind: row.kind,
      lifecycleState: row.lifecycleState as SiteLifecycleState,
      sectorId: row.sectorId,
      attributes: row.attributes ?? {},
      createdAt: row.createdAt.toISOString()
    }
  };
}

export function sightingRowToFeature(row: SightingRow): Feature<SightingFeatureProperties> {
  return {
    type: 'Feature',
    id: row.id,
    geometry: parsePoint(row.pointGeoJSON),
    properties: {
      id: row.id,
      ts: row.ts.toISOString(),
      siteId: row.siteId,
      description: row.description,
      attributes: row.attributes ?? {}
    }
  };
}

export function toFeatureCollection<P>(features: Feature<P>[]): FeatureCollection<P> {
  return { type: 'FeatureCollection', features };
}

function parsePoint(raw: string | null): GeoPoint | null {
  const parsed = parseGeoJSONPoint(raw);
  if (!parsed) return null;
  return { type: 'Point', coordinates: parsed.coordinates };
}
