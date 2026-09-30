import { Injectable } from '@nestjs/common';

@Injectable()
export class PlanService {
  placeholder() {
    return { todo: 'plan' };
  }
}
