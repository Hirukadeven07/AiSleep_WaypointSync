import { anyCatalogueItem, buildLines, buildOrderLines, fullCatalogue } from './catalogue';

describe('fullCatalogue', () => {
  it('lists every brand, the given brand first', () => {
    const tech = fullCatalogue('Tech');
    expect(tech).toHaveLength(35);
    expect(tech[0]!.id).toBe('T-PHONE');
    expect(new Set(tech.map((c) => c.id)).size).toBe(35);
    expect(fullCatalogue('Fresh')[0]!.id).toBe('F-MILK');
  });
});

describe('anyCatalogueItem', () => {
  it('finds an item whatever its brand', () => {
    expect(anyCatalogueItem('S-SHIRT')?.type).toBe('style');
    expect(anyCatalogueItem('NOT-AN-ITEM')).toBeUndefined();
  });
});

describe('buildOrderLines', () => {
  it('lets chilled food and fresh goods share an order, and marks it chilled', () => {
    const built = buildOrderLines([
      { catalogueId: 'F-MILK', qty: 2 },
      { catalogueId: 'F-BREAD', qty: 1 },
    ]);
    expect(built.lines.map((l) => l.itemId)).toEqual(['F-MILK', 'F-BREAD']);
    expect(built.units).toBe(3);
    expect(built.weightKg).toBe(34.2);
    expect(built.chilled).toBe(true);
  });

  it('builds an order of another brand on its own, ambient', () => {
    const built = buildOrderLines([{ catalogueId: 'T-TV', qty: 3 }]);
    expect(built.units).toBe(3);
    expect(built.chilled).toBe(false);
  });

  it.each([
    ['Tech with chilled food', 'T-PHONE', 'F-MILK'],
    ['Style with fresh goods', 'S-SHIRT', 'F-BREAD'],
    ['Style with Tech', 'S-SHIRT', 'T-PHONE'],
  ])('refuses %s in one order', (_name, a, b) => {
    expect(() =>
      buildOrderLines([
        { catalogueId: a, qty: 1 },
        { catalogueId: b, qty: 1 },
      ]),
    ).toThrow('one kind of goods');
  });

  it('refuses an item that is not in the catalogue', () => {
    expect(() => buildOrderLines([{ catalogueId: 'NOT-AN-ITEM', qty: 1 }])).toThrow(
      'Unknown catalogue item',
    );
  });
});

describe('buildLines', () => {
  it('still keeps the seeds to one brand’s list', () => {
    expect(buildLines('Fresh', [{ catalogueId: 'F-MILK', qty: 1 }]).units).toBe(1);
    expect(() => buildLines('Fresh', [{ catalogueId: 'T-PHONE', qty: 1 }])).toThrow(
      'Unknown catalogue item T-PHONE for Fresh',
    );
  });
});
