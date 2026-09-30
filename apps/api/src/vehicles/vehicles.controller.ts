import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
@Roles('dispatcher')
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  placeholder() {
    return this.vehicles.placeholder();
  }
}
