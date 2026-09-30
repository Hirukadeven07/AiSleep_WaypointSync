import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { LoadsService } from './loads.service';

@Controller('loads')
@Roles('loader')
export class LoadsController {
  constructor(private readonly loads: LoadsService) {}

  @Get()
  placeholder() {
    return this.loads.placeholder();
  }
}
