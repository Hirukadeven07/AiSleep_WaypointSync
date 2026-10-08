import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { DepartSummary, LoadQueueItem, LoadSheet } from '@waypoint/contracts';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { DepartDto, FlagDto, StartLoadingDto, TakenOffDto } from './dto/loads.dto';
import { LoadsService } from './loads.service';

@Controller('loads')
@Roles('loader')
export class LoadsController {
  constructor(private readonly loads: LoadsService) {}

  @Get()
  queue(@CurrentUser() me: AuthUser): Promise<LoadQueueItem[]> {
    return this.loads.queue(me);
  }

  @Get(':tripId')
  sheet(@CurrentUser() me: AuthUser, @Param('tripId') tripId: string): Promise<LoadSheet> {
    return this.loads.sheet(me, tripId);
  }

  @Post(':tripId/start')
  @HttpCode(200)
  start(
    @CurrentUser() me: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: StartLoadingDto,
  ): Promise<LoadSheet> {
    return this.loads.start(me, tripId, dto);
  }

  @Post(':tripId/flags')
  @HttpCode(200)
  addFlag(
    @CurrentUser() me: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: FlagDto,
  ): Promise<LoadSheet> {
    return this.loads.addFlag(me, tripId, dto);
  }

  @Delete(':tripId/flags/:flagId')
  removeFlag(
    @CurrentUser() me: AuthUser,
    @Param('tripId') tripId: string,
    @Param('flagId') flagId: string,
  ): Promise<LoadSheet> {
    return this.loads.removeFlag(me, tripId, flagId);
  }

  @Post(':tripId/taken-off')
  @HttpCode(200)
  takenOff(
    @CurrentUser() me: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: TakenOffDto,
  ): Promise<LoadSheet> {
    return this.loads.takenOff(me, tripId, dto.orderId);
  }

  @Post(':tripId/ack')
  @HttpCode(200)
  acknowledge(@CurrentUser() me: AuthUser, @Param('tripId') tripId: string): Promise<LoadSheet> {
    return this.loads.acknowledge(me, tripId);
  }

  @Post(':tripId/depart')
  @HttpCode(200)
  depart(
    @CurrentUser() me: AuthUser,
    @Param('tripId') tripId: string,
    @Body() dto: DepartDto,
  ): Promise<DepartSummary> {
    return this.loads.depart(me, tripId, dto.planVersion);
  }
}
