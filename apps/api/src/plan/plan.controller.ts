import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { PlanService } from './plan.service';

@Controller('plan')
@Roles('dispatcher')
export class PlanController {
  constructor(private readonly plan: PlanService) {}

  @Get()
  placeholder() {
    return this.plan.placeholder();
  }
}
