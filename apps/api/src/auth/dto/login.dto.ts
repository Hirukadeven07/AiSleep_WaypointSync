import { IsIn, IsOptional, IsString } from 'class-validator';
import type { LoginRequest, Role } from '@waypoint/contracts';

export class LoginDto implements LoginRequest {
  @IsIn(['dispatcher', 'store', 'loader', 'driver'])
  role: Role;

  @IsString()
  loginId: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsString()
  depotId?: string;
}
