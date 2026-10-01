import { Controller, Get } from '@nestjs/common';
import type { DriverDayResponse } from '@waypoint/contracts';
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
}
