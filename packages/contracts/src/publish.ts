import type { ReasonCode } from './reasons';

export interface Issue {
  code: ReasonCode;
  message: string;
  tripId?: string;
  stopId?: string;
}

export interface PublishResult {
  ok: boolean;
  blocking: Issue[];
  warnings: Issue[];
}
