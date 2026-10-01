import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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
