import { Type } from 'class-transformer';
import {
  ArrayMax,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import type { DriverEventType } from '@waypoint/contracts';

export const DRIVER_EVENT_TYPES = [
  'SOS_ALERT',
  'ARRIVED',
  'ACKNOWLEDGEMENT',
  'ROAD_ISSUE',
  'FUEL_READING',
] as const satisfies DriverEventType[];

export class DriverEventInputDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @IsOptional()
  @IsString()
  tripId: string | null = null;

  @IsIn(DRIVER_EVENT_TYPES)
  type!: DriverEventType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsISO8601()
  createdOnPhoneAt!: string;

  @IsOptional()
  @IsNumber()
  seenPlanVersion: number | null = null;
}

export class SyncPushRequestDto {
  @IsArray()
  @ArrayMax(100)
  @ValidateNested({ each: true })
  @Type(() => DriverEventInputDto)
  events!: DriverEventInputDto[];
}
