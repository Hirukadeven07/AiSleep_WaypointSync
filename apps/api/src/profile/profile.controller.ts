import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Put,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import type { ChangePasswordResponse, Me, NotificationPreferences } from '@waypoint/contracts';
import { AuthedRequest, AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ChangeDepotDto, ChangePasswordDto, NotificationPreferencesDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

/**
 * The global pipe strips unknown keys without complaint. The preferences body is typed with the
 * contract interface, so the global pipe skips it and this pipe rejects unknown keys instead.
 */
const strictPrefs = new ValidationPipe({
  expectedType: NotificationPreferencesDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

/** The signed-in user's own settings. Every role may use it; GET /api/me stays in AuthController. */
@Controller('me')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Patch('depot')
  changeDepot(@CurrentUser() me: AuthUser, @Body() dto: ChangeDepotDto): Promise<Me> {
    return this.profile.changeDepot(me, dto.depotId);
  }

  @Post('password')
  @HttpCode(200)
  changePassword(
    @CurrentUser() me: AuthUser,
    @Req() req: AuthedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<ChangePasswordResponse> {
    return this.profile.changePassword(me, req.sessionId, dto);
  }

  @Get('notification-preferences')
  notificationPreferences(@CurrentUser() me: AuthUser): Promise<NotificationPreferences> {
    return this.profile.notificationPreferences(me);
  }

  @Put('notification-preferences')
  saveNotificationPreferences(
    @CurrentUser() me: AuthUser,
    @Body(strictPrefs) prefs: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    return this.profile.saveNotificationPreferences(me, prefs);
  }
}
