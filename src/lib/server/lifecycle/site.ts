/**
 * Server-side re-export of the site lifecycle machine. Authoritative
 * definition lives at `$lib/shared/lifecycle/site` so the client picker can
 * consume the same data without pulling in server-only modules.
 */
export { type SiteState, siteMachine } from '$lib/shared/lifecycle/site';
