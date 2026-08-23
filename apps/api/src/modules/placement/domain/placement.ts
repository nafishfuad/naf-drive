/**
 * Placement Engine v1 — largest-fit with per-account caps.
 *
 * available(connection) = floor(total × cap%) − used − reserved
 * Pick the candidate with the MOST available space (fewest fragments).
 * Ties break deterministically by connectionId so tests are stable.
 *
 * Connections without a synced quota (totalBytes == null) are skipped — we
 * refuse to place into an account whose capacity we have never measured.
 */

export interface PlacementCandidate {
  readonly connectionId: string;
  readonly totalBytes: number | null;
  readonly usedBytes: number;
  /** Bytes spoken for by in-flight upload sessions on this account. */
  readonly reservedBytes: number;
  readonly capPct: number;
}

export type PlacementResult =
  | { ok: true; connectionId: string; availableBytes: number }
  | { ok: false; reason: 'NO_CANDIDATES' | 'NO_SPACE' };

export function pickTarget(candidates: readonly PlacementCandidate[], sizeBytes: number): PlacementResult {
  if (candidates.length === 0) return { ok: false, reason: 'NO_CANDIDATES' };

  let best: { id: string; available: number } | null = null;
  for (const c of candidates) {
    if (c.totalBytes == null) continue;
    const capBytes = Math.floor((c.totalBytes * c.capPct) / 100);
    const available = capBytes - c.usedBytes - c.reservedBytes;
    if (available < sizeBytes) continue;
    if (
      best === null ||
      available > best.available ||
      (available === best.available && c.connectionId < best.id)
    ) {
      best = { id: c.connectionId, available };
    }
  }

  return best === null
    ? { ok: false, reason: 'NO_SPACE' }
    : { ok: true, connectionId: best.id, availableBytes: best.available };
}
