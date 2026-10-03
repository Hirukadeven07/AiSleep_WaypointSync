import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { AddVehicleRequest } from '@waypoint/contracts';

export class AddVehicleDto implements AddVehicleRequest {
  @IsString()
  @Matches(/^\s*[A-Za-z0-9][A-Za-z0-9 -]{1,14}\s*$/, {
    message: 'plate must be 2 to 15 letters, digits, spaces or hyphens',
  })
  plate: string;

  @IsIn(['truck', 'van'])
  type: 'truck' | 'van';

  @IsIn(['reefer', 'ambient'])
  temp: 'reefer' | 'ambient';

  @IsNumber()
  @Min(100)
  @Max(40_000)
  weightCapKg: number;

  @IsNumber()
  @Min(1)
  @Max(120)
  volumeCapM3: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(40)
  kmPerL?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5_000)
  weeklyFuelQuotaL?: number;
}

export class OutOfServiceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  reason: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  returnDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
