export type DistrictTone = 'active' | 'other' | 'unserved';

/** Monaragala and Moneragala are the same district under two spellings. */
const ALIAS: Record<string, string> = {
  Monaragala: 'Moneragala',
  Moneragala: 'Monaragala',
};

export function districtTone(
  district: { depotId: string | null; served: boolean },
  selectedDepotId: string,
): DistrictTone {
  if (!district.served || !district.depotId) return 'unserved';
  return district.depotId === selectedDepotId ? 'active' : 'other';
}

export function toneFor(name: string, tones: ReadonlyMap<string, DistrictTone>): DistrictTone {
  return tones.get(name) ?? tones.get(ALIAS[name] ?? '') ?? 'unserved';
}

type Ring = [number, number][];

function contains(point: [number, number], ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A label anchor that sits inside the district. A plain average of the outline
 * often falls in the sea for coastal shapes, and those labels then draw off the map.
 */
export function interiorPoint(ring: Ring): [number, number] {
  const n = Math.max(ring.length > 1 ? ring.length - 1 : ring.length, 1);
  let sx = 0;
  let sy = 0;
  let minX = 180;
  let minY = 90;
  let maxX = -180;
  let maxY = -90;
  for (let i = 0; i < n; i++) {
    const [x, y] = ring[i]!;
    sx += x;
    sy += y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const center: [number, number] = [sx / n, sy / n];
  if (contains(center, ring)) return center;

  let best: [number, number] = center;
  let bestDist = Infinity;
  for (let row = 1; row <= 7; row++) {
    for (let col = 1; col <= 7; col++) {
      const point: [number, number] = [
        minX + ((maxX - minX) * col) / 8,
        minY + ((maxY - minY) * row) / 8,
      ];
      if (!contains(point, ring)) continue;
      const dist = (point[0] - center[0]) ** 2 + (point[1] - center[1]) ** 2;
      if (dist < bestDist) {
        best = point;
        bestDist = dist;
      }
    }
  }
  return best;
}
