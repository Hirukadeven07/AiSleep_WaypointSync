import type { Brand, CatalogueItem } from '@waypoint/contracts';

/** A small fixed catalogue per brand. Store orders and demo fixtures build their lines from it. */
export const CATALOGUE: Record<Brand, CatalogueItem[]> = {
  Fresh: [
    {
      id: 'F-MILK',
      name: 'Fresh milk 1 L',
      pack: 'crate of 12',
      chilled: true,
      unitWeightKg: 12.6,
      unitVolumeM3: 0.018,
    },
    {
      id: 'F-YOG',
      name: 'Set yoghurt',
      pack: 'tray of 24',
      chilled: true,
      unitWeightKg: 2.6,
      unitVolumeM3: 0.006,
    },
    {
      id: 'F-CHKN',
      name: 'Chicken, whole',
      pack: 'box of 10',
      chilled: true,
      unitWeightKg: 12,
      unitVolumeM3: 0.03,
    },
    {
      id: 'F-BREAD',
      name: 'Sandwich bread',
      pack: 'crate of 20',
      chilled: false,
      unitWeightKg: 9,
      unitVolumeM3: 0.06,
    },
    {
      id: 'F-VEG',
      name: 'Mixed vegetables',
      pack: 'crate',
      chilled: false,
      unitWeightKg: 15,
      unitVolumeM3: 0.045,
    },
    {
      id: 'F-RICE',
      name: 'Samba rice 5 kg',
      pack: 'bundle of 4',
      chilled: false,
      unitWeightKg: 20,
      unitVolumeM3: 0.03,
    },
  ],
  Style: [
    {
      id: 'S-SHIRT',
      name: 'Shirts, assorted',
      pack: 'carton of 20',
      chilled: false,
      unitWeightKg: 6,
      unitVolumeM3: 0.05,
    },
    {
      id: 'S-DENIM',
      name: 'Denim trousers',
      pack: 'carton of 12',
      chilled: false,
      unitWeightKg: 8,
      unitVolumeM3: 0.05,
    },
    {
      id: 'S-SHOE',
      name: 'Footwear',
      pack: 'carton of 10 pairs',
      chilled: false,
      unitWeightKg: 9,
      unitVolumeM3: 0.08,
    },
  ],
  Tech: [
    {
      id: 'T-PHONE',
      name: 'Smartphones',
      pack: 'carton of 10',
      chilled: false,
      unitWeightKg: 3,
      unitVolumeM3: 0.012,
    },
    {
      id: 'T-TV',
      name: '43" television',
      pack: 'single box',
      chilled: false,
      unitWeightKg: 11,
      unitVolumeM3: 0.11,
    },
    {
      id: 'T-ACC',
      name: 'Accessories',
      pack: 'carton',
      chilled: false,
      unitWeightKg: 4,
      unitVolumeM3: 0.03,
    },
  ],
};

export function catalogueItem(brand: Brand, id: string): CatalogueItem | undefined {
  return CATALOGUE[brand].find((c) => c.id === id);
}

/** Order-line rows (without orderId) and totals for a list of catalogue picks. */
export function buildLines(brand: Brand, picks: { catalogueId: string; qty: number }[]) {
  const lines = picks.map((p) => {
    const item = catalogueItem(brand, p.catalogueId);
    if (!item) throw new Error(`Unknown catalogue item ${p.catalogueId} for ${brand}`);
    return {
      name: item.name,
      qty: p.qty,
      pack: item.pack,
      chilled: item.chilled,
      unitWeightKg: item.unitWeightKg,
      unitVolumeM3: item.unitVolumeM3,
    };
  });
  const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
  return {
    lines,
    units: lines.reduce((s, l) => s + l.qty, 0),
    weightKg: round(
      lines.reduce((s, l) => s + l.qty * l.unitWeightKg, 0),
      2,
    ),
    volumeM3: round(
      lines.reduce((s, l) => s + l.qty * l.unitVolumeM3, 0),
      3,
    ),
    chilled: lines.some((l) => l.chilled),
  };
}
