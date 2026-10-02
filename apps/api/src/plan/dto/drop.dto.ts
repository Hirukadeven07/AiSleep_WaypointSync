import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
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

export class DeferDto {
  @IsString()
  @MinLength(1)
  orderId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  reason: string;
}

export class OrderIdDto {
  @IsString()
  @MinLength(1)
  orderId: string;
}

export class CreateTripDto {
  @IsString()
  @MinLength(1)
  vehicleId: string;

  @IsIn([1, 2])
  tripNumber: 1 | 2;

  @IsIn(['Fresh', 'Style', 'Tech'])
  brand: 'Fresh' | 'Style' | 'Tech';

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  districts: string[];

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}

export class PublishDto {
  @IsOptional()
  @IsBoolean()
  anyway?: boolean;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
