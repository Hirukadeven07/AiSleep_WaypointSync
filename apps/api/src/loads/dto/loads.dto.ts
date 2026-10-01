import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { DepartRequest, FlagRequest, FlagType } from '@waypoint/contracts';

export class FlagDto implements FlagRequest {
  @IsString()
  stopId: string;

  @IsOptional()
  @IsString()
  orderLineId?: string;

  @IsIn(['missing', 'damaged', 'wrong_quantity'])
  type: FlagType;

  @IsOptional()
  @IsInt()
  @Min(0)
  qty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

export class DepartDto implements DepartRequest {
  @IsInt()
  @Min(1)
  planVersion: number;
}
