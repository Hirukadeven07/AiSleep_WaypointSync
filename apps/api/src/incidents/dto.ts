import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { RecoveryAction } from '@waypoint/contracts';

export class ResolveDto {
  @IsIn(['replacement', 'tomorrow', 'split', 'defer_one'])
  action!: RecoveryAction;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  /** The stop to move to the next delivery day, for "defer_one". */
  @IsOptional()
  @IsString()
  deferStopId?: string;

  /** Why the delivery moved; shown to the store. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class BreakdownDto {
  @IsString()
  @MinLength(1)
  tripId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
