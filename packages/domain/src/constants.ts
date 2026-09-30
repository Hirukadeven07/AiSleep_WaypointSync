/**
 * Booklet time budgets, per trip, keyed by the trip's brand
 * (first stop sets the brand).
 */
import type { Brand } from './types';

export const TIME_BUDGET_MIN: Record<Brand, number> = {
  Fresh: 270,
  Style: 480,
  Tech: 480,
};

export const MAX_TRIPS_PER_VEHICLE_PER_DAY = 2;
