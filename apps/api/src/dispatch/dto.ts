import { ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class NotifyDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  stopIds: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message: string;
}

export class ResolveSosDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class MoveStopDto {
  @IsString()
  @MinLength(1)
  stopId: string;

  @IsString()
  @MinLength(1)
  toTripId: string;
}
