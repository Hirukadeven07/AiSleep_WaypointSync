import { ArrayMaxSize, IsArray } from 'class-validator';

/**
 * Only the envelope is validated here. Each event is checked one by one in SyncService,
 * so a single malformed event is rejected on its own instead of failing (and blocking)
 * the whole outbox batch with a 400.
 */
export class SyncPushRequestDto {
  @IsArray()
  @ArrayMaxSize(100)
  events!: unknown[];
}
