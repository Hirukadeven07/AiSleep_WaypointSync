import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  LiveDay,
  LocateMap,
  MoveOptions,
  MoveStopResult,
  NotifyPreview,
  NotifyResult,
} from '@waypoint/contracts';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MapService } from '../map/map.service';
import { DispatchService } from './dispatch.service';
import { MoveStopDto, NotifyDto, ResolveSosDto } from './dto';
import { MoveStopService } from './move-stop.service';

@Controller('dispatch')
@Roles('dispatcher')
export class DispatchController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly moves: MoveStopService,
    private readonly maps: MapService,
  ) {}

  /** Drivers placed on the last store they reached. `depot` switches which yard is highlighted. */
  @Get('map')
  map(@CurrentUser() me: AuthUser, @Query('depot') depot?: string): Promise<LocateMap> {
    return this.maps.locate(me, depot);
  }

  /** Where each stop the driver has not reached could move (another of today's trips at the depot). */
  @Get('trips/:id/move-options')
  moveOptions(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<MoveOptions> {
    return this.moves.options(me, id);
  }

  /** Move one stop to another trip; the store gets a notice with the new truck and ETA. */
  @Post('trips/:id/move-stop')
  @HttpCode(200)
  moveStop(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: MoveStopDto,
  ): Promise<MoveStopResult> {
    return this.moves.move(me, id, dto.stopId, dto.toTripId);
  }

  /** Today's trips with where each one is, plus what needs attention. Feeds the live day and the dispatch board. */
  @Get('live')
  live(@CurrentUser() me: AuthUser): Promise<LiveDay> {
    return this.dispatch.live(me);
  }

  /** Dispatch has dealt with a driver's SOS: it leaves the board and the driver's phone. */
  @Post('sos/:id/resolve')
  @HttpCode(200)
  resolveSos(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveSosDto,
  ): Promise<{ ok: true }> {
    return this.dispatch.resolveSos(me, id, dto.note);
  }

  /** The stores a delay on this trip would reach, and the message they would get. Sends nothing. */
  @Get('trips/:id/notify-preview')
  notifyPreview(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<NotifyPreview> {
    return this.dispatch.notifyPreview(me, id);
  }

  /** Tell the chosen stores about a delay, in their app. */
  @Post('trips/:id/notify')
  @HttpCode(200)
  notify(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: NotifyDto,
  ): Promise<NotifyResult> {
    return this.dispatch.notify(me, id, dto.stopIds, dto.message);
  }
}
