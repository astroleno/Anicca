/** Shared surface-distance contract, in pixels or normalized canvas units. */
export const LIQUID_APPROACH_GAP = .55;
export const LIQUID_CONTACT_GAP = .16;
export const LIQUID_RELEASE_GAP = .24;
export const LIQUID_HOLD_MS = 350;
export const LIQUID_DWELL_MS = 320;

/** Input queued before delivery already counts towards the physical hold. */
export function liquidHoldRemaining(eventTime: number, now: number): number {
  if (!Number.isFinite(eventTime) || !Number.isFinite(now) || eventTime <= 0 || eventTime > now) return LIQUID_HOLD_MS;
  return Math.max(0, LIQUID_HOLD_MS - (now - eventTime));
}

export function liquidProximity(distance: number, radiusA: number, radiusB: number, retained = false) {
  const sum = radiusA + radiusB;
  if (!Number.isFinite(distance) || !Number.isFinite(sum) || distance < 0 || !(radiusA > 0) || !(radiusB > 0)) {
    return { strength: 0, contact: false, gap: Infinity };
  }
  const gap = (distance - sum) / sum;
  const amount = Math.max(0, Math.min(1, (LIQUID_APPROACH_GAP - gap) / (LIQUID_APPROACH_GAP - LIQUID_CONTACT_GAP)));
  return { gap, strength: amount * amount * (3 - 2 * amount),
    contact: gap <= (retained ? LIQUID_RELEASE_GAP : LIQUID_CONTACT_GAP) };
}
