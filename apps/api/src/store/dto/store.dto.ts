import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { FlagType, PlaceOrderRequest, ReceiptLine, ReceiptRequest } from '@waypoint/contracts';

class OrderPickDto {
  @IsString()
  catalogueId: string;

  @IsInt()
  @Min(1)
  @Max(500)
  qty: number;
}

export class PlaceOrderDto implements PlaceOrderRequest {
  @ValidateNested({ each: true })
  @Type(() => OrderPickDto)
  @ArrayMinSize(1)
  lines: OrderPickDto[];
}

class ReceiptLineDto implements ReceiptLine {
  @IsString()
  orderLineId: string;

  @IsInt()
  @Min(0)
  receivedQty: number;

  @IsOptional()
  @IsIn(['missing', 'damaged', 'wrong_quantity'])
  issue?: FlagType;
}

export class ReceiptDto implements ReceiptRequest {
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines: ReceiptLineDto[];

  @IsOptional()
  @IsBoolean()
  chilledWasCold?: boolean;

  @IsOptional()
  @IsString()
  signaturePng?: string;
}
