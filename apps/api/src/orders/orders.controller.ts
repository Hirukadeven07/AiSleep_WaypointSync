import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { OrdersService } from './orders.service';

@Controller('orders')
@Roles('dispatcher')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  placeholder() {
    return this.orders.placeholder();
  }
}
