import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { StopsService } from './stops.service';

@Controller('stops')
@Roles('driver')
export class StopsController {
  constructor(private readonly stops: StopsService) {}

  @Get()
  placeholder() {
    return this.stops.placeholder();
  }
}
