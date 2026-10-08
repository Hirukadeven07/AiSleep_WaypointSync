import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { IncidentDetail, IncidentList } from '@waypoint/contracts';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AcknowledgeDto, BreakdownDto, LogIncidentDto, ResolveDto } from './dto';
import { IncidentsService } from './incidents.service';

@Controller('incidents')
@Roles('dispatcher')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  /** Active incidents and those resolved this week. */
  @Get()
  list(@CurrentUser() me: AuthUser): Promise<IncidentList> {
    return this.incidents.list(me);
  }

  /** Log an incident by hand on one of the depot's trips (a breakdown also stops the trip). */
  @Post()
  @HttpCode(200)
  log(@CurrentUser() me: AuthUser, @Body() dto: LogIncidentDto): Promise<IncidentDetail> {
    return this.incidents.log(me, dto);
  }

  /** A truck broke down: stop its trip and open a breakdown incident to recover the remaining stops. */
  @Post('breakdown')
  @HttpCode(200)
  breakdown(@CurrentUser() me: AuthUser, @Body() dto: BreakdownDto): Promise<IncidentDetail> {
    return this.incidents.reportBreakdown(me, dto.tripId, dto.note);
  }

  @Get(':id')
  detail(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<IncidentDetail> {
    return this.incidents.detail(me, id);
  }

  /** Mark the incident as seen. */
  @Post(':id/acknowledge')
  @HttpCode(200)
  acknowledge(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: AcknowledgeDto,
  ): Promise<IncidentDetail> {
    return this.incidents.acknowledge(me, id, dto?.explicit === true);
  }

  /** Tell the stores still waiting on the trip to expect a delay. */
  @Post(':id/notify')
  @HttpCode(200)
  notify(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<IncidentDetail> {
    return this.incidents.notifyStores(me, id);
  }

  /** Recover from a breakdown: replacement vehicle, tomorrow, split, or defer one chosen store. */
  @Post(':id/resolve')
  @HttpCode(200)
  resolve(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveDto,
  ): Promise<IncidentDetail> {
    return this.incidents.resolve(me, id, dto);
  }

  /** Mark an incident resolved when there is nothing left to recover. */
  @Post(':id/close')
  @HttpCode(200)
  close(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<IncidentDetail> {
    return this.incidents.close(me, id);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<IncidentDetail> {
    return this.incidents.reopen(me, id);
  }
}
