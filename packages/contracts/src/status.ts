export type Role = 'dispatcher' | 'store' | 'loader' | 'driver';
export type Brand = 'Fresh' | 'Style' | 'Tech';
export type Temp = 'chilled' | 'ambient';
export type OrderStatus = 'waiting' | 'planned' | 'deferred' | 'delivered' | 'partial';
export type TripStatus =
  | 'planning'
  | 'published'
  | 'loading'
  | 'ready'
  | 'on_road'
  | 'completed'
  | 'breakdown';
export type StopStatus =
  | 'upcoming'
  | 'arrived'
  | 'waiting'
  | 'confirmed'
  | 'delivered'
  | 'partial'
  | 'deferred'
  | 'at_risk';
export type VehicleStatus = 'available' | 'out_of_service' | 'on_road';
