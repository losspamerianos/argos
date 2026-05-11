/**
 * Shared API wire shapes. Both server endpoints (under
 * `routes/api/o/[orgSlug]/[opSlug]/...`) and the corresponding client forms
 * import from here so the contract has a single source of truth.
 */

export type GeoPoint = { type: 'Point'; coordinates: [number, number] };

/**
 * **Invariant**: `feature.id === feature.properties.id`. The duplication
 * exists because MapLibre's GeoJSON source drops top-level `Feature.id`
 * when it isn't an integer; the property-level `id` is what we promote
 * via `promoteId: 'id'`. Consumers SHOULD prefer `feature.id`; the
 * properties copy is there for MapLibre's benefit, not for direct use.
 */
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

/**
 * Site lifecycle state. Single source of truth lives in
 * `$lib/shared/lifecycle/site.ts` (the same machine the server enforces
 * with). Aliasing here keeps the wire-name `SiteLifecycleState` while
 * preventing two parallel unions from silently drifting.
 */
import type { SiteState } from '$lib/shared/lifecycle/site';
export type SiteLifecycleState = SiteState;

/**
 * `id` is also duplicated into properties because MapLibre's GeoJSON source
 * silently drops top-level `Feature.id` when it is a string (UUID) rather
 * than an integer, breaking `queryRenderedFeatures(...).id` for hit-testing.
 * The Map source is configured with `promoteId: 'id'` to use this property
 * as the canonical feature ID at render time.
 */
export type SiteFeatureProperties = {
  id: string;
  name: string;
  kind: string;
  lifecycleState: SiteLifecycleState;
  sectorId: string | null;
  attributes: Record<string, unknown>;
  createdAt: string;
};

export type SightingFeatureProperties = {
  id: string;
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

/**
 * Update payload — all fields optional, partial-merge semantics on the server
 * (only fields explicitly present are touched). `attributes` is replaced
 * wholesale when present, not merged: callers pass the new full object or
 * omit the field. `lifecycleState` is **not** mutable here — that goes
 * through the dedicated transition endpoint to keep the state-machine
 * enforced in one place.
 */
export type UpdateSitePayload = {
  name?: string;
  kind?: string;
  lon?: number | null;
  lat?: number | null;
  attributes?: Record<string, unknown>;
};

/** State-machine transition request. Server consults `siteMachine`. */
export type SiteTransitionPayload = {
  to: SiteLifecycleState;
};

export type SiteListResponse = FeatureCollection<SiteFeatureProperties>;
export type SightingListResponse = FeatureCollection<SightingFeatureProperties>;
export type SiteCreateResponse = { site: Feature<SiteFeatureProperties> };
export type SiteReadResponse = { site: Feature<SiteFeatureProperties> };
export type SiteUpdateResponse = { site: Feature<SiteFeatureProperties> };
export type SiteTransitionResponse = {
  site: Feature<SiteFeatureProperties>;
  from: SiteLifecycleState;
  to: SiteLifecycleState;
};
export type SightingCreateResponse = { sighting: Feature<SightingFeatureProperties> };
