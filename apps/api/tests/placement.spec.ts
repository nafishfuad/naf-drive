import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { pickTarget } from '../src/modules/placement/domain/placement';

const candidateArb = fc.record({
  connectionId: fc.string({ minLength: 3, maxLength: 12 }).noShrink(),
  totalBytes: fc.option(fc.integer({ min: 1, max: 10_000_000 }), { nil: null }),
  usedBytes: fc.integer({ min: 0, max: 5_000_000 }),
  reservedBytes: fc.integer({ min: 0, max: 2_000_000 }),
  capPct: fc.integer({ min: 1, max: 100 }),
});

function availableOf(
  c: { totalBytes: number | null; usedBytes: number; reservedBytes: number; capPct: number },
  _size: number,
): number {
  if (c.totalBytes == null) return -Infinity;
  return Math.floor((c.totalBytes * c.capPct) / 100) - c.usedBytes - c.reservedBytes;
}

describe('pickTarget — property-based', () => {
  it('never picks a connection that cannot fit the file', () => {
    fc.assert(
      fc.property(
        fc.array(candidateArb, { maxLength: 8 }),
        fc.integer({ min: 0, max: 4_000_000 }),
        (candidates, size) => {
          const result = pickTarget(candidates, size);
          if (!result.ok) return;
          const chosen = candidates.find((c) => c.connectionId === result.connectionId)!;
          expect(availableOf(chosen, size)).toBeGreaterThanOrEqual(size);
          expect(result.availableBytes).toBeGreaterThanOrEqual(size);
        },
      ),
    );
  });

  it('picks the candidate with the maximum available space', () => {
    fc.assert(
      fc.property(
        fc.array(candidateArb, { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (candidates, size) => {
          const result = pickTarget(candidates, size);
          if (!result.ok) return;
          const maxAvailable = Math.max(...candidates.map((c) => availableOf(c, size)));
          expect(result.availableBytes).toBe(maxAvailable);
        },
      ),
    );
  });

  it('returns NO_SPACE when nothing fits and NO_CANDIDATES for empty input', () => {
    expect(pickTarget([], 0)).toEqual({ ok: false, reason: 'NO_CANDIDATES' });

    fc.assert(
      fc.property(
        fc.array(candidateArb, { maxLength: 6 }),
        fc.integer({ min: 20_000_000, max: 50_000_000 }),
        (candidates, hugeSize) => {
          // Totals capped at 10MB in the arb → a ≥20MB file can never fit.
          const result = pickTarget(candidates, hugeSize);
          expect(result.ok).toBe(false);
          if (!result.ok && candidates.length > 0) {
            expect(result.reason).toBe('NO_SPACE');
          }
        },
      ),
    );
  });
});

describe('pickTarget — deterministic examples', () => {
  const base = { usedBytes: 0, reservedBytes: 0, capPct: 100 };

  it('respects the user-set cap percentage', () => {
    const result = pickTarget(
      [
        { connectionId: 'a', totalBytes: 1000, usedBytes: 0, reservedBytes: 0, capPct: 50 },
        { connectionId: 'b', totalBytes: 2000, usedBytes: 0, reservedBytes: 0, capPct: 30 },
      ],
      550,
    );
    // a offers floor(1000×50%) = 500 < 550 → skipped; b offers 600.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.connectionId).toBe('b');
  });

  it('subtracts bytes already reserved by in-flight sessions', () => {
    const result = pickTarget(
      [{ connectionId: 'a', totalBytes: 1000, usedBytes: 300, reservedBytes: 600, capPct: 100 }],
      200,
    );
    expect(result.ok).toBe(false);
  });

  it('skips connections whose quota was never synced', () => {
    const result = pickTarget(
      [
        { connectionId: 'unsynced', totalBytes: null, ...base },
        { connectionId: 'synced', totalBytes: 1000, ...base },
      ],
      500,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.connectionId).toBe('synced');
  });
});
