import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { FleetDay, FleetVehicle, OutOfServiceResult } from '@waypoint/contracts';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OutOfServiceDto } from './dto';
import { FleetService } from './fleet.service';

@Controller('fleet')
@Roles('dispatcher')
export class FleetController {
  constructor(private readonly fleet: FleetService) {}

  /** The depot's vehicles with what each is doing today. */
  @Get()
  day(@CurrentUser() me: AuthUser): Promise<FleetDay> {
    return this.fleet.day(me);
  }

  /** Take a vehicle out of service; trips that have not started go back to Planning. */
  @Post(':id/out-of-service')
  @HttpCode(200)
  outOfService(
    @CurrentUser() me: AuthUser,
    @Param('id') id: string,
    @Body() dto: OutOfServiceDto,
  ): Promise<OutOfServiceResult> {
    return this.fleet.markOutOfService(me, id, dto);
  }

  @Post(':id/back-in-service')
  @HttpCode(200)
  backInService(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<FleetVehicle> {
    return this.fleet.backInService(me, id);
  }
}
