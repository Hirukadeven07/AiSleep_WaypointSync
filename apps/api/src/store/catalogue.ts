import type { Brand, CatalogueItem, ItemType } from '@waypoint/contracts';

function row(
  id: string,
  name: string,
  pack: string,
  type: ItemType,
  unitWeightKg: number,
  unitVolumeM3: number,
): CatalogueItem {
  return {
    id,
    name,
    pack,
    type,
    chilled: type === 'chilled_food',
    unitWeightKg,
    unitVolumeM3,
  };
}

/** Ten items per brand, plus ten chilled-food SKUs on Fresh. Style and Tech stay one type each. */
export const CATALOGUE: Record<Brand, CatalogueItem[]> = {
  Fresh: [
    row('F-MILK', 'Fresh milk 1 L', 'crate of 12', 'chilled_food', 12.6, 0.018),
    row('F-YOG', 'Set yoghurt', 'tray of 24', 'chilled_food', 2.6, 0.006),
    row('F-CHKN', 'Chicken, whole', 'box of 10', 'chilled_food', 12, 0.03),
    row('F-CHEE', 'Cheddar cheese', 'crate of 8', 'chilled_food', 8, 0.02),
    row('F-BUTTR', 'Butter 500 g', 'carton of 20', 'chilled_food', 10, 0.016),
    row('F-CURD', 'Buffalo curd', 'crate of 12', 'chilled_food', 9, 0.02),
    row('F-FISH', 'Fish fillets', 'crate of 8', 'chilled_food', 10, 0.025),
    row('F-SAUS', 'Chicken sausages', 'carton of 20', 'chilled_food', 8, 0.022),
    row('F-CREAM', 'Fresh cream 200 ml', 'crate of 24', 'chilled_food', 5.2, 0.012),
    row('F-ICE', 'Ice cream 1 L', 'carton of 8', 'chilled_food', 7.2, 0.024),
    row('F-BREAD', 'Sandwich bread', 'crate of 20', 'fresh', 9, 0.06),
    row('F-VEG', 'Mixed vegetables', 'crate', 'fresh', 15, 0.045),
    row('F-RICE', 'Samba rice 5 kg', 'bundle of 4', 'fresh', 20, 0.03),
    row('F-FRUIT', 'Mixed fruit', 'crate', 'fresh', 12, 0.04),
    row('F-DHAL', 'Red dhal 2 kg', 'bundle of 10', 'fresh', 20, 0.028),
  ],
  Style: [
    row('S-SHIRT', 'Shirts, assorted', 'carton of 20', 'style', 6, 0.05),
    row('S-DENIM', 'Denim trousers', 'carton of 12', 'style', 8, 0.05),
    row('S-SHOE', 'Footwear', 'carton of 10 pairs', 'style', 9, 0.08),
    row('S-DRESS', 'Dresses', 'carton of 10', 'style', 5, 0.06),
    row('S-SOCK', 'Socks, packs', 'carton of 40', 'style', 4, 0.025),
    row('S-HAT', 'Caps and hats', 'carton of 24', 'style', 3.5, 0.04),
    row('S-BELT', 'Belts', 'carton of 30', 'style', 5, 0.03),
    row('S-JACK', 'Jackets', 'carton of 8', 'style', 10, 0.09),
    row('S-SKIRT', 'Skirts', 'carton of 12', 'style', 5.5, 0.045),
    row('S-BAG', 'Handbags', 'carton of 8', 'style', 7, 0.07),
  ],
  Tech: [
    row('T-PHONE', 'Smartphones', 'carton of 10', 'tech', 3, 0.012),
    row('T-TV', '43" television', 'single box', 'tech', 11, 0.11),
    row('T-ACC', 'Accessories', 'carton', 'tech', 4, 0.03),
    row('T-TAB', 'Tablets', 'carton of 8', 'tech', 4.5, 0.02),
    row('T-LAP', 'Laptops', 'carton of 4', 'tech', 8, 0.04),
    row('T-HEAD', 'Headphones', 'carton of 20', 'tech', 3.2, 0.025),
    row('T-CHG', 'Chargers', 'carton of 40', 'tech', 5, 0.02),
    row('T-SPK', 'Bluetooth speakers', 'carton of 12', 'tech', 6, 0.035),
    row('T-WATCH', 'Smartwatches', 'carton of 16', 'tech', 2.4, 0.015),
    row('T-CABLE', 'Cables', 'carton of 50', 'tech', 3.8, 0.018),
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
      itemId: item.id,
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
