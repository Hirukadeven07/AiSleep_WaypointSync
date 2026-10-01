import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { LiveDay, NotifyPreview, NotifyResult } from '@waypoint/contracts';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DispatchService } from './dispatch.service';
import { NotifyDto } from './dto';

@Controller('dispatch')
@Roles('dispatcher')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  /** Today's trips with where each one is, plus what needs attention. Feeds the live day and the dispatch board. */
  @Get('live')
  live(@CurrentUser() me: AuthUser): Promise<LiveDay> {
    return this.dispatch.live(me);
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
