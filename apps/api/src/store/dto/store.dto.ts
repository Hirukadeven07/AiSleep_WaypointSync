import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  FlagType,
  PlaceOrderRequest,
  ReceiptLine,
  ReceiptRequest,
  StockLevel,
} from '@waypoint/contracts';

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

  @IsOptional()
  @IsBoolean()
  urgent?: boolean;

  /** Required when urgent; otherwise ignored. */
  @ValidateIf((o: PlaceOrderDto) => o.urgent === true)
  @IsIn(['out_of_stock', 'running_low'])
  stockLevel?: StockLevel;

  @ValidateIf((o: PlaceOrderDto) => o.urgent === true)
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  urgentNote?: string;
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
