import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import type {
  ChangeDepotRequest,
  ChangePasswordRequest,
  NotificationPreferences,
} from '@waypoint/contracts';

export class ChangeDepotDto implements ChangeDepotRequest {
  @IsString()
  @IsNotEmpty()
  depotId: string;
}

/** Length and digit rules depend on the role, so the service checks `newSecret`. */
export class ChangePasswordDto implements ChangePasswordRequest {
  /** Required whenever a password or PIN is set; a PIN role with none yet may leave it out. */
  @IsOptional()
  @IsString()
  currentSecret?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  newSecret: string;
}

export class NotificationPreferencesDto implements NotificationPreferences {
  @IsBoolean()
  deliveryUpdates: boolean;

  @IsBoolean()
  delayAlerts: boolean;

  @IsBoolean()
  incidentAlerts: boolean;

  @IsBoolean()
  planChanges: boolean;
}
