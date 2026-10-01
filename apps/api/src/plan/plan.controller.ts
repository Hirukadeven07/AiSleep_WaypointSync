import { Controller, Get, Query } from '@nestjs/common';
import type { PlanDay } from '@waypoint/contracts';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PlanService } from './plan.service';

@Controller('plan')
@Roles('dispatcher')
export class PlanController {
  constructor(private readonly plan: PlanService) {}

  /** The plan board for a service day (defaults to tomorrow). */
  @Get()
  day(@CurrentUser() me: AuthUser, @Query('date') date?: string): Promise<PlanDay> {
    return this.plan.day(me, date);
  }
}
