import type { Brand, OrderStatus, StopStatus } from './status';
import type { OrderLine } from './order';
import type { FlagType } from './dock';

/** Orders for tomorrow are refused from 16:00 Asia/Colombo. */
export const ORDER_CUTOFF_MIN = 16 * 60;

export interface CatalogueItem {
  id: string;
  name: string;
  pack: string;
  chilled: boolean;
  unitWeightKg: number;
  unitVolumeM3: number;
}

export interface StoreOrderView {
  id: string;
  deliveryDate: string; // YYYY-MM-DD
  status: OrderStatus;
  units: number;
  weightKg: number;
  volumeM3: number;
  chilled: boolean;
  deferReason: string | null;
  movedFromDate: string | null;
  repeatSkip: boolean;
}

/** One delivery to this store: a trip stop with its handoff timestamps. */
export interface StoreDelivery {
  stopId: string;
  orderId: string;
  serviceDate: string;
  status: StopStatus;
  etaMin: number | null;
  plate: string | null;
  driverName: string | null;
  chilled: boolean;
  arrivedAt: string | null;
  storeConfirmedAt: string | null;
  driverAckAt: string | null;
  signaturePhotoKey: string | null;
  signedAt: string | null;
  lines: OrderLine[];
}

export interface StoreHome {
  storeId: string;
  storeName: string;
  brand: Brand;
  windowOpenMin: number;
  windowCloseMin: number;
  cutoffMin: number;
  nowMin: number;
  today: string;
  delivery: StoreDelivery | null;
  nextOrder: StoreOrderView | null;
  deferral: StoreOrderView | null;
  unreadNotices: number;
}

export interface PlaceOrderRequest {
  lines: { catalogueId: string; qty: number }[];
}

export interface ReceiptLine {
  orderLineId: string;
  receivedQty: number;
  issue?: FlagType;
}

export interface ReceiptRequest {
  lines: ReceiptLine[];
  chilledWasCold?: boolean;
  /** PNG from the signature pad (raw base64 or a data-URL). */
  signaturePng?: string;
}

export interface StoreNotice {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}
