import type { Brand, OrderStatus, Temp } from './status';

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
  urgentNote: string | null;
  lines?: OrderLine[];
}
