/**
 * Lead priority scoring. Transparent, weighted-sum heuristic – no ML.
 * Operations can override weights via `operation.attributes.lead_weights`.
 */

export type LeadScoreInputs = {
  /** Earclip-Quote of the lead's site, 0..1; lower means higher priority. */
  siteEarclipRate?: number;
  /** Animal sex; female (esp. fertile queens) ranks higher. */
  animalSex?: 'female' | 'male' | 'unknown';
  /** Reproduction state of the animal. */
  reproductionState?: 'pregnant' | 'lactating' | 'in_heat' | 'none' | 'unknown';
  /** Days since the originating sighting; older leads decay slowly. */
  ageDays?: number;
  /** Whether the lead is a re-trap of a previously processed animal. */
  isRetrap?: boolean;
  /** Whether the lead's site sits in the operational core sector. */
  inCoreSector?: boolean;
};

export type LeadScoreWeights = {
  earclipGap: number;
  female: number;
  pregnant: number;
  lactating: number;
  inHeat: number;
  ageDecay: number;
  retrap: number;
  coreSector: number;
};

export const DEFAULT_WEIGHTS: LeadScoreWeights = {
  earclipGap: 60,
  female: 30,
  pregnant: 50,
  lactating: 40,
  inHeat: 20,
  ageDecay: -1,
  retrap: 15,
  coreSector: 10
};

export function scoreLead(
  inputs: LeadScoreInputs,
  weights: Partial<LeadScoreWeights> = {}
): number {
  const w = { ...DEFAULT_WEIGHTS, ...weights };
  let s = 0;

  if (inputs.siteEarclipRate !== undefined) {
    const gap = Math.max(0, 0.8 - inputs.siteEarclipRate);
    s += w.earclipGap * gap;
  }
  if (inputs.animalSex === 'female') s += w.female;
  if (inputs.reproductionState === 'pregnant') s += w.pregnant;
  if (inputs.reproductionState === 'lactating') s += w.lactating;
  if (inputs.reproductionState === 'in_heat') s += w.inHeat;
  if (inputs.ageDays !== undefined) s += w.ageDecay * inputs.ageDays;
  if (inputs.isRetrap) s += w.retrap;
  if (inputs.inCoreSector) s += w.coreSector;

  return Math.round(s);
}
