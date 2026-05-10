/**
 * Shared API wire shapes. Both server endpoints (under
 * `routes/api/o/[orgSlug]/[opSlug]/...`) and the corresponding client forms
 * import from here so the contract has a single source of truth.
 */

export type GeoPoint = { type: 'Point'; coordinates: [number, number] };

export type Feature<P> = {
  type: 'Feature';
  id: string;
  geometry: GeoPoint | null;
  properties: P;
};

export type FeatureCollection<P> = {
  type: 'FeatureCollection';
  features: Feature<P>[];
};

/** Tags echo `sites_lifecycle_check` in the DB; mirrors `lifecycle/site.ts`. */
export type SiteLifecycleState =
  | 'discovered'
  | 'assessed'
  | 'in_sanitation'
  | 'at_threshold'
  | 'in_hold'
  | 'handed_over'
  | 'archived';

export type SiteFeatureProperties = {
  name: string;
  kind: string;
  lifecycleState: SiteLifecycleState;
  sectorId: string | null;
  attributes: Record<string, unknown>;
  createdAt: string;
};

export type SightingFeatureProperties = {
  ts: string;
  siteId: string | null;
  description: string | null;
  attributes: Record<string, unknown>;
};

export type CreateSitePayload = {
  name: string;
  kind: string;
  lon?: number | null;
  lat?: number | null;
  attributes?: Record<string, unknown>;
};

export type CreateSightingPayload = {
  ts?: string | null;
  lon?: number | null;
  lat?: number | null;
  siteId?: string | null;
  description?: string | null;
  attributes?: Record<string, unknown>;
};

export type SiteListResponse = FeatureCollection<SiteFeatureProperties>;
export type SightingListResponse = FeatureCollection<SightingFeatureProperties>;
export type SiteCreateResponse = { site: Feature<SiteFeatureProperties> };
export type SightingCreateResponse = { sighting: Feature<SightingFeatureProperties> };
