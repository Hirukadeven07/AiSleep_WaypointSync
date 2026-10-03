import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { DriverDayResponse, DriverNotice } from '@waypoint/contracts';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverService } from './driver.service';

@Controller('driver')
@Roles('driver')
export class DriverController {
  constructor(private readonly driver: DriverService) {}

  @Get('day')
  day(@CurrentUser() me: AuthUser): Promise<DriverDayResponse> {
    return this.driver.day(me);
  }

  /** Notices from dispatch and stores: trip published, plan changed, goods checked. */
  @Get('notices')
  notices(@CurrentUser() me: AuthUser): Promise<DriverNotice[]> {
    return this.driver.notices(me);
  }

  @Post('notices/:id/read')
  @HttpCode(200)
  markNoticeRead(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.driver.markNoticeRead(me, id);
  }
}
