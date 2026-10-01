import { Module } from '@nestjs/common';
import { DispatchModule } from '../dispatch/dispatch.module';
import { PlanModule } from '../plan/plan.module';
import { FleetController } from './fleet.controller';
import { FleetService } from './fleet.service';

@Module({
  imports: [DispatchModule, PlanModule],
  controllers: [FleetController],
  providers: [FleetService],
})
export class FleetModule {}
