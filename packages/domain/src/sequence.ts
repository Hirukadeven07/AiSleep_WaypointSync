/**
 * Window owns the sequence. Dispatcher picks the truck; this module picks stop order.
 * Delivery = earliest window-open, then window-close, then outlet id (stable).
 * LIFO load = exact reverse of delivery. Hiruka's dock must use loadOrder.
 */
import type { StopView } from './types';

export function sortStopsByWindow(stops: StopView[]): StopView[] {
  return [...stops].sort((a, b) => {
    if (a.outlet.windowOpenMin !== b.outlet.windowOpenMin) {
      return a.outlet.windowOpenMin - b.outlet.windowOpenMin;
    }
    if (a.outlet.windowCloseMin !== b.outlet.windowCloseMin) {
      return a.outlet.windowCloseMin - b.outlet.windowCloseMin;
    }
    return a.outlet.id.localeCompare(b.outlet.id);
  });
}

/** `loadOrder[0]` is the first crate the loader should pick up. */
export function loadOrder(deliveryStops: StopView[]): StopView[] {
  return [...deliveryStops].reverse();
}

export function lifoLoadOrder(stops: StopView[]): StopView[] {
  return loadOrder(sortStopsByWindow(stops));
}
