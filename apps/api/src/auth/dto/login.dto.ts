import { IsIn, IsOptional, IsString } from 'class-validator';
import type { LoginRequest, Role } from '@waypoint/contracts';

export class LoginDto implements LoginRequest {
  @IsIn(['dispatcher', 'store', 'loader', 'driver'])
  role: Role;

  /** Not used for the dock sign-in (loader): the depot and its dock password identify the tablet. */
  @IsOptional()
  @IsString()
  loginId?: string;

  @IsOptional()
  @IsString()
  secret?: string;

  @IsOptional()
  @IsString()
  depotId?: string;
}
