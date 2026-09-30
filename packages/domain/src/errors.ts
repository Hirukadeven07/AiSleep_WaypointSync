import type { ReasonCode } from '@waypoint/contracts';

export class DomainError extends Error {
  constructor(
    public readonly reasonCode: ReasonCode,
    message?: string,
  ) {
    super(message ?? reasonCode);
    this.name = 'DomainError';
  }
}
