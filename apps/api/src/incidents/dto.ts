import { IsIn, IsOptional, IsString } from 'class-validator';

export class ResolveDto {
  @IsIn(['replacement', 'tomorrow', 'split'])
  action!: 'replacement' | 'tomorrow' | 'split';

  @IsOptional()
  @IsString()
  vehicleId?: string;
}
