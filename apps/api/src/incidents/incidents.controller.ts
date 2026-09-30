import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { IncidentsService } from './incidents.service';

@Controller('incidents')
@Roles('dispatcher')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  placeholder() {
    return this.incidents.placeholder();
  }
}
