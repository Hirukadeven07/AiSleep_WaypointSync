import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { SyncPullResponse, SyncPushResponse } from '@waypoint/contracts';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SyncPushRequestDto } from './dto/sync.dto';
import { SyncService } from './sync.service';

@Controller('sync')
@Roles('driver')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get()
  pull(@CurrentUser() me: AuthUser): Promise<SyncPullResponse> {
    return this.sync.pull(me);
  }

  @Post()
  @HttpCode(200)
  push(@CurrentUser() me: AuthUser, @Body() dto: SyncPushRequestDto): Promise<SyncPushResponse> {
    return this.sync.push(me, dto.events);
  }
}
