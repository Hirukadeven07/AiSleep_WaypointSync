import { IsString, MinLength } from 'class-validator';
import type { DropRequest } from '@waypoint/contracts';

export class DropDto implements DropRequest {
  @IsString()
  @MinLength(1)
  orderId: string;

  @IsString()
  @MinLength(1)
  tripId: string;
}

export class UnassignDto {
  @IsString()
  @MinLength(1)
  orderId: string;
}
