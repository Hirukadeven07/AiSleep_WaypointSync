import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { SyncService } from './sync.service';

@Controller('sync')
@Roles('driver')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get()
  placeholder() {
    return this.sync.placeholder();
  }
}
