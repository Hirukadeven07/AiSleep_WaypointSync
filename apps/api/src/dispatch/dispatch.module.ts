import { Module } from '@nestjs/common';
import { IncidentsModule } from '../incidents/incidents.module';
import { MapModule } from '../map/map.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlanModule } from '../plan/plan.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';
import { MoveStopService } from './move-stop.service';

@Module({
  imports: [NotificationsModule, PlanModule, MapModule, IncidentsModule],
  controllers: [DispatchController],
  providers: [DispatchService, MoveStopService],
  exports: [DispatchService],
})
export class DispatchModule {}
