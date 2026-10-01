import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  AssignResult,
  DropCheck,
  PlanDay,
  PlanOrderDetail,
  UnassignResult,
} from '@waypoint/contracts';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DropDto, UnassignDto } from './dto/drop.dto';
import { PlanEditService } from './plan-edit.service';
import { PlanService } from './plan.service';

@Controller('plan')
@Roles('dispatcher')
export class PlanController {
  constructor(
    private readonly plan: PlanService,
    private readonly edit: PlanEditService,
  ) {}

  /** The plan board for a service day (defaults to tomorrow). */
  @Get()
  day(@CurrentUser() me: AuthUser, @Query('date') date?: string): Promise<PlanDay> {
    return this.plan.day(me, date);
  }

  @Get('orders/:id')
  order(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<PlanOrderDetail> {
    return this.edit.orderDetail(me, id);
  }

  /** What dropping an order on a trip would do. Saves nothing. */
  @Post('check')
  @HttpCode(200)
  check(@CurrentUser() me: AuthUser, @Body() dto: DropDto): Promise<DropCheck> {
    return this.edit.check(me, dto.orderId, dto.tripId);
  }

  /** Put an order on a trip (or move it from another trip). Hard-rule breaks answer 409 with the reason code. */
  @Post('assign')
  @HttpCode(200)
  assign(@CurrentUser() me: AuthUser, @Body() dto: DropDto): Promise<AssignResult> {
    return this.edit.assign(me, dto.orderId, dto.tripId);
  }

  /** Take an order off its trip; it goes back to waiting. */
  @Post('unassign')
  @HttpCode(200)
  unassign(@CurrentUser() me: AuthUser, @Body() dto: UnassignDto): Promise<UnassignResult> {
    return this.edit.unassign(me, dto.orderId);
  }
}
