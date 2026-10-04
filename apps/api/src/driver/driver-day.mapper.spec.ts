import {
  buildDriverDay,
  pickActiveTripId,
  type DriverDayStopRow,
  type DriverDayTripRow,
  type DriverDayVehicleRow,
} from './driver-day.mapper';

const DAY = '2026-10-01';

function stopRow(overrides: Partial<DriverDayStopRow> = {}): DriverDayStopRow {
  return {
    id: 'stop-1',
    sequence: 1,
    status: 'upcoming',
    etaMin: 330,
    arrivedAt: null,
    storeConfirmedAt: null,
    driverAckAt: null,
    order: {
      id: 'order-1',
      urgentNote: 'Use the back gate',
      store: {
        id: 'STORE-1',
        displayName: 'Kandy Road Fresh',
        windowOpenMin: 300,
        windowCloseMin: 480,
        lat: 6.9271,
        lng: 79.8612,
        dockType: 'rear_dock',
        parkingConstraint: 'normal',
        mallWindow: null,
        district: { name: 'Colombo 07' },
        phones: [{ label: 'shop', phoneNo: '0112000000' }],
      },
    },
    flags: [],
    ...overrides,
  };
}

function withStore(
  store: Partial<DriverDayStopRow['order']['store']>,
  overrides: Partial<DriverDayStopRow> = {},
): DriverDayStopRow {
  const base = stopRow(overrides);
  return { ...base, order: { ...base.order, store: { ...base.order.store, ...store } } };
}

function tripRow(overrides: Partial<DriverDayTripRow> = {}): DriverDayTripRow {
  return {
    id: 'trip-1',
    tripNumber: 1,
    status: 'published',
    planVersion: 1,
    stops: [],
    ...overrides,
  };
}

function vehicleRow(overrides: Partial<DriverDayVehicleRow> = {}): DriverDayVehicleRow {
  return { id: 'VEH-1', numberPlate: 'WP-LB-1234', type: 'truck', trips: [], ...overrides };
}

function onlyStop(stop: DriverDayStopRow) {
  const day = buildDriverDay(DAY, vehicleRow({ trips: [tripRow({ stops: [stop] })] }));
  return day.trips[0]!.stops[0]!;
}

describe('buildDriverDay', () => {
  it('returns the empty day when the driver has no vehicle', () => {
    expect(buildDriverDay(DAY, null)).toEqual({
      serviceDate: DAY,
      vehicle: null,
      trips: [],
      activeTripId: null,
      upcoming: [],
      unreadNotices: 0,
      roadIssue: null,
      break: { onBreakSince: null, usedMin: 0, allowanceMin: 45 },
    });
  });

  it('shows upcoming trips and the unread count even without a vehicle today', () => {
    const day = buildDriverDay(DAY, null, {
      upcoming: [tripRow({ id: 'tomorrow', serviceDate: new Date('2026-10-02T00:00:00Z') })],
      unreadNotices: 2,
    });
    expect(day.upcoming.map((t) => [t.id, t.serviceDate])).toEqual([['tomorrow', '2026-10-02']]);
    expect(day.unreadNotices).toBe(2);
  });

  it('falls back to the vehicle id when the plate is missing', () => {
    const day = buildDriverDay(DAY, vehicleRow({ numberPlate: null, type: 'van' }));
    expect(day.vehicle).toEqual({ id: 'VEH-1', plate: 'VEH-1', type: 'van' });
    expect(day.trips).toEqual([]);
    expect(day.activeTripId).toBeNull();
  });

  it('maps a stop with window, eta, address, phone and navigate URL', () => {
    expect(onlyStop(stopRow())).toEqual({
      id: 'stop-1',
      sequence: 1,
      orderId: 'order-1',
      storeId: 'STORE-1',
      outletName: 'Kandy Road Fresh',
      address: 'Colombo 07',
      status: 'upcoming',
      windowStart: 300,
      windowEnd: 480,
      eta: 330,
      phone: '0112000000',
      phones: [{ label: 'shop', phoneNo: '0112000000' }],
      lat: 6.9271,
      lng: 79.8612,
      navigateUrl:
        'https://www.google.com/maps/dir/?api=1&destination=6.9271,79.8612&travelmode=driving',
      urgentNote: 'Use the back gate',
      handover: { dockType: 'rear_dock', parking: 'normal', mallWindow: null },
      arrivedAt: null,
      storeConfirmedAt: null,
      driverAckAt: null,
      flags: [],
      storeIssues: [],
    });
  });

  it("lists only this trip's store issues, with the item name", () => {
    const base = stopRow();
    const stop = {
      ...base,
      order: {
        ...base.order,
        fieldFlags: [
          { tripId: 'trip-1', reason: 'missing', qtyFlagged: 2, item: { itemName: 'Milk' } },
          { tripId: 'old-trip', reason: 'damaged', qtyFlagged: 1, item: { itemName: 'Bread' } },
          { tripId: 'trip-1', reason: 'damaged', qtyFlagged: null, item: null },
        ],
      },
    };
    const day = buildDriverDay(
      DAY,
      vehicleRow({ trips: [tripRow({ id: 'trip-1', stops: [stop] })] }),
    );
    expect(day.trips[0]!.stops[0]!.storeIssues).toEqual([
      { itemName: 'Milk', qty: 2, reason: 'missing' },
      { itemName: 'Whole delivery', qty: null, reason: 'damaged' },
    ]);
  });

  it('uses the store id as the name and no navigate URL without coordinates', () => {
    const stop = onlyStop(
      withStore({ displayName: null, lat: null, lng: 79.8612, phones: [] }, { etaMin: null }),
    );
    expect(stop.outletName).toBe('STORE-1');
    expect(stop.navigateUrl).toBeNull();
    expect(stop.phone).toBeNull();
    expect(stop.eta).toBeNull();

    expect(onlyStop(withStore({ lat: 6.9, lng: null })).navigateUrl).toBeNull();
  });

  it('picks the shop phone, else any outlet phone', () => {
    const manager = { label: 'manager' as const, phoneNo: '0771111111' };
    const shop = { label: 'shop' as const, phoneNo: '0772222222' };

    const withShop = onlyStop(withStore({ phones: [manager, shop] }));
    expect(withShop.phone).toBe('0772222222');
    expect(withShop.phones).toEqual([manager, shop]);

    expect(onlyStop(withStore({ phones: [manager] })).phone).toBe('0771111111');
    expect(onlyStop(withStore({ phones: [] })).phone).toBeNull();
  });

  it('sends timestamps as ISO strings and flags with the item name', () => {
    const stop = onlyStop(
      stopRow({
        status: 'confirmed',
        arrivedAt: new Date('2026-10-01T03:40:00.000Z'),
        storeConfirmedAt: new Date('2026-10-01T03:55:00.000Z'),
        driverAckAt: null,
        flags: [
          { id: 'flag-1', type: 'damaged', qty: 2, note: 'Crushed', orderLine: { name: 'Milk' } },
          { id: 'flag-2', type: 'missing', qty: null, note: null, orderLine: null },
        ],
      }),
    );
    expect(stop.arrivedAt).toBe('2026-10-01T03:40:00.000Z');
    expect(stop.storeConfirmedAt).toBe('2026-10-01T03:55:00.000Z');
    expect(stop.driverAckAt).toBeNull();
    expect(stop.flags).toEqual([
      { id: 'flag-1', type: 'damaged', qty: 2, note: 'Crushed', itemName: 'Milk' },
      { id: 'flag-2', type: 'missing', qty: null, note: null, itemName: null },
    ]);
  });

  it('keeps only workable trips and sorts trips and stops', () => {
    const day = buildDriverDay(
      DAY,
      vehicleRow({
        trips: [
          tripRow({ id: 'done', tripNumber: 1, status: 'completed' }),
          tripRow({
            id: 'second',
            tripNumber: 2,
            status: 'ready',
            stops: [stopRow({ id: 's2', sequence: 2 }), stopRow({ id: 's1', sequence: 1 })],
          }),
          tripRow({ id: 'first', tripNumber: 1, status: 'published', planVersion: 3 }),
          tripRow({ id: 'draft', tripNumber: 3, status: 'planning' }),
          tripRow({ id: 'broken', tripNumber: 4, status: 'breakdown' }),
        ],
      }),
    );
    expect(day.trips.map((trip) => trip.id)).toEqual(['first', 'second']);
    expect(day.trips[0]!.planVersion).toBe(3);
    expect(day.trips[1]!.stops.map((stop) => stop.id)).toEqual(['s1', 's2']);
    expect(day.activeTripId).toBe('first');
  });
});

describe('pickActiveTripId', () => {
  it('prefers the on_road trip', () => {
    expect(
      pickActiveTripId([
        { id: 'a', tripNumber: 1, status: 'published' },
        { id: 'b', tripNumber: 2, status: 'on_road' },
      ]),
    ).toBe('b');
  });

  it('falls back to the lowest trip number', () => {
    expect(
      pickActiveTripId([
        { id: 'b', tripNumber: 2, status: 'ready' },
        { id: 'a', tripNumber: 1, status: 'loading' },
      ]),
    ).toBe('a');
  });

  it('returns null without trips', () => {
    expect(pickActiveTripId([])).toBeNull();
  });
});
