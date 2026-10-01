import { Controller, Get } from '@nestjs/common';
import type { LiveDay } from '@waypoint/contracts';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DispatchService } from './dispatch.service';

@Controller('dispatch')
@Roles('dispatcher')
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  /** Today's trips with where each one is, plus what needs attention. Feeds the live day and the dispatch board. */
  @Get('live')
  live(@CurrentUser() me: AuthUser): Promise<LiveDay> {
    return this.dispatch.live(me);
  }
}
