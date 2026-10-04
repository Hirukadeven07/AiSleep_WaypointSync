import type { Brand, ItemType, OrderStatus, StopStatus } from './status';
import type { OrderLine, StockLevel } from './order';
import type { FlagType } from './dock';

/** Orders for tomorrow are refused from 16:00 Asia/Colombo. */
export const ORDER_CUTOFF_MIN = 16 * 60;

/**
 * Goods that may share one order. An order holds items of a single group, so a
 * Style or Tech order never needs a refrigerated truck. Chilled food and fresh
 * goods travel together, as on a Fresh run.
 */
export const ORDER_GROUP: Record<ItemType, Brand> = {
  chilled_food: 'Fresh',
  fresh: 'Fresh',
  style: 'Style',
  tech: 'Tech',
};

export interface CatalogueItem {
  id: string;
  name: string;
  pack: string;
  type: ItemType;
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
  urgent: boolean;
  stockLevel: StockLevel | null;
  urgentNote: string | null;
}

/** A line of an order the store placed. catalogueId is null when the line is not a catalogue item. */
export interface StoreOrderLineView {
  catalogueId: string | null;
  name: string;
  qty: number;
  pack: string;
}

/** An order with its lines: what is already placed, and the source for "order again". */
export interface StoreOrderDetail extends StoreOrderView {
  lines: StoreOrderLineView[];
}

/** A line the store flagged at receipt (ERD FieldFlag). The driver accepts or disputes it. */
export interface StoreIssue {
  id: string;
  itemName: string;
  qty: number | null;
  reason: string;
  driverDecision: 'pending' | 'accepted' | 'rejected';
  /** False until a replacement of this item is ordered, or the flag is marked solved. */
  resolveStatus: boolean;
}

/** One flagged line for this store, including when it was raised. */
export interface StoreFlag extends StoreIssue {
  raisedAt: string;
}

/** One stop on the trip for the store's progress strip; `isYou` marks this store's stop. */
export interface StoreTrackStop {
  sequence: number;
  status: StopStatus;
  isYou: boolean;
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
  /**
   * Stops still to be served before this one on the same trip (0 = this store is next).
   * Null unless the trip is on the road and this stop is upcoming or at risk.
   */
  stopsAway: number | null;
  /** Every stop on the trip in delivery order. Other stores are not named. */
  track: StoreTrackStop[];
  lines: OrderLine[];
  issues: StoreIssue[];
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
  /** Flags for this store that are still unresolved. */
  openFlagCount: number;
  phones: { label: 'shop' | 'manager' | 'warehouse'; phoneNo: string }[];
}

export interface PlaceOrderRequest {
  lines: { catalogueId: string; qty: number }[];
  /** Marks the order urgent; `stockLevel` is then required. */
  urgent?: boolean;
  stockLevel?: StockLevel;
  /** Optional note for the dispatcher, up to 200 characters. Ignored unless urgent. */
  urgentNote?: string;
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
