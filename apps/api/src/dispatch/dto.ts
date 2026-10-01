import { ArrayMinSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator';

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
