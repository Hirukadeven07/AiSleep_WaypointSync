import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type {
  DepartRequest,
  FlagRequest,
  FlagType,
  StartLoadingRequest,
  TakenOffRequest,
} from '@waypoint/contracts';

export class StartLoadingDto implements StartLoadingRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  loaderId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  pin: string;
}

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

export class TakenOffDto implements TakenOffRequest {
  @IsString()
  @IsNotEmpty()
  orderId: string;
}

export class DepartDto implements DepartRequest {
  @IsInt()
  @Min(1)
  planVersion: number;
}
