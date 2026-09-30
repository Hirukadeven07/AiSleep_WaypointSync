/**
 * Weight and volume vs vehicle caps.
 * Not a drop-block: red while planning, blocks publish (see publish.ts).
 */
import { Reason } from '../reasons';
import type { Order, RuleIssue, StopView, Vehicle } from '../types';

export type CapacitySnapshot = {
  usedWeightKg: number;
  usedVolumeM3: number;
  weightCapKg: number;
  volumeCapM3: number;
  overWeight: boolean;
  overVolume: boolean;
};

export function measureCapacity(vehicle: Vehicle, orders: Order[]): CapacitySnapshot {
  const usedWeightKg = orders.reduce((sum, order) => sum + order.weightKg, 0);
  const usedVolumeM3 = orders.reduce((sum, order) => sum + order.volumeM3, 0);
  return {
    usedWeightKg,
    usedVolumeM3,
    weightCapKg: vehicle.weightCapKg,
    volumeCapM3: vehicle.volumeCapM3,
    overWeight: usedWeightKg > vehicle.weightCapKg,
    overVolume: usedVolumeM3 > vehicle.volumeCapM3,
  };
}

export function capacityIssues(vehicle: Vehicle, stops: StopView[], asBlock: boolean): RuleIssue[] {
  const snap = measureCapacity(
    vehicle,
    stops.map((stop) => stop.order),
  );
  const severity = asBlock ? 'block' : 'warn';
  const issues: RuleIssue[] = [];

  if (snap.overWeight) {
    issues.push({
      code: Reason.OVER_WEIGHT,
      severity,
      message: `Weight ${snap.usedWeightKg} kg exceeds cap ${snap.weightCapKg} kg on ${vehicle.id}.`,
    });
  }
  if (snap.overVolume) {
    issues.push({
      code: Reason.OVER_VOLUME,
      severity,
      message: `Volume ${snap.usedVolumeM3} m³ exceeds cap ${snap.volumeCapM3} m³ on ${vehicle.id}.`,
    });
  }

  return issues;
}
