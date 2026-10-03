import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class OutOfServiceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  reason: string;

  /** Date and time. Omitted when the return time is not known. A date with no clock time is rejected. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/)
  returnDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
