import { Module } from '@nestjs/common';
import { PlanController } from './plan.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlanAutoService } from './plan-auto.service';
import { PlanDeferService } from './plan-defer.service';
import { PlanEditService } from './plan-edit.service';
import { PlanPublishService } from './plan-publish.service';
import { PlanTripsService } from './plan-trips.service';
import { PlanService } from './plan.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PlanController],
  providers: [
    PlanService,
    PlanEditService,
    PlanDeferService,
    PlanTripsService,
    PlanPublishService,
    PlanAutoService,
  ],
  exports: [PlanService],
})
export class PlanModule {}
