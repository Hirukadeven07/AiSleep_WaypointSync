import { Module } from '@nestjs/common';
import { PlanController } from './plan.controller';
import { PlanEditService } from './plan-edit.service';
import { PlanService } from './plan.service';

@Module({
  controllers: [PlanController],
  providers: [PlanService, PlanEditService],
  exports: [PlanService],
})
export class PlanModule {}
