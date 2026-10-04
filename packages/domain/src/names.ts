import type { Depot, Outlet, Vehicle } from './types';

/** Names people read in rule messages: plates, store names and depot names, never internal ids. */
export const vehicleName = (v: Pick<Vehicle, 'id' | 'name'>) => v.name || v.id;
export const outletName = (o: Pick<Outlet, 'id' | 'name'>) => o.name || o.id;

const DEPOT_NAMES: Record<string, string> = { depo1: 'Peliyagoda', depo2: 'Kandy' };
export const depotName = (d: Depot | string) => DEPOT_NAMES[d] ?? d;
