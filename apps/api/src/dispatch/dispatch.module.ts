import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlanModule } from '../plan/plan.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { MoveStopService } from './move-stop.service';

@Module({
  imports: [NotificationsModule, PlanModule],
  controllers: [DispatchController],
  providers: [DispatchService, MoveStopService],
  exports: [DispatchService],
})
export class DispatchModule {}
