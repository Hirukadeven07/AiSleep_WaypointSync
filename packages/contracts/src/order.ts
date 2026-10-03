import type { Brand, OrderStatus, Temp } from './status';

/** How short the store is when it marks an order urgent. */
export type StockLevel = 'out_of_stock' | 'running_low';

export interface OrderLine {
  id: string;
  name: string;
  qty: number;
  pack: string;
  chilled: boolean;
  unitWeightKg: number;
  unitVolumeM3: number;
}

export interface Order {
  id: string;
  storeId: string;
  brand: Brand;
  deliveryDate: string; // YYYY-MM-DD
  temp: Temp;
  status: OrderStatus;
  units: number;
  weightKg: number;
  volumeM3: number;
  urgent: boolean;
  stockLevel: StockLevel | null;
  urgentNote: string | null;
  lines?: OrderLine[];
}
