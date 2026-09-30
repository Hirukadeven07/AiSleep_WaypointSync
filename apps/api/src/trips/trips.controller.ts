import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { TripsService } from './trips.service';

@Controller('trips')
@Roles('dispatcher')
export class TripsController {
  constructor(private readonly trips: TripsService) {}

  @Get()
  placeholder() {
    return this.trips.placeholder();
  }
}
