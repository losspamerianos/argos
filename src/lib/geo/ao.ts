/**
 * Default map center and zoom used when no Operation is selected, or as
 * fallback if an Operation has no AO polygon.
 */
export type GeoConfig = {
  defaultCenter: [number, number];
  defaultZoom: number;
};

export function readGeoConfig(): GeoConfig {
  const lon = Number(process.env.MAP_DEFAULT_CENTER_LON ?? 0);
  const lat = Number(process.env.MAP_DEFAULT_CENTER_LAT ?? 0);
  const zoom = Number(process.env.MAP_DEFAULT_ZOOM ?? 6);
  return { defaultCenter: [lon, lat], defaultZoom: zoom };
}
