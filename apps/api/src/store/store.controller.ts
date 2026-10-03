import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import type {
  CatalogueItem,
  StoreDelivery,
  StoreHome,
  StoreNotice,
  StoreOrderDetail,
  StoreOrderView,
} from '@waypoint/contracts';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PlaceOrderDto, ReceiptDto } from './dto/store.dto';
import { StoreService } from './store.service';

@Controller('store')
@Roles('store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get('home')
  home(@CurrentUser() me: AuthUser): Promise<StoreHome> {
    return this.store.home(me);
  }

  @Get('catalogue')
  catalogue(@CurrentUser() me: AuthUser): Promise<CatalogueItem[]> {
    return this.store.catalogue(me);
  }

  @Get('orders')
  orders(@CurrentUser() me: AuthUser): Promise<StoreOrderView[]> {
    return this.store.orders(me);
  }

  @Get('orders/recent')
  recentOrders(@CurrentUser() me: AuthUser): Promise<StoreOrderDetail[]> {
    return this.store.recentOrders(me);
  }

  @Get('saved')
  saved(@CurrentUser() me: AuthUser): Promise<string[]> {
    return this.store.saved(me);
  }

  @Put('saved/:itemId')
  saveItem(@CurrentUser() me: AuthUser, @Param('itemId') itemId: string): Promise<string[]> {
    return this.store.saveItem(me, itemId);
  }

  @Delete('saved/:itemId')
  unsaveItem(@CurrentUser() me: AuthUser, @Param('itemId') itemId: string): Promise<string[]> {
    return this.store.unsaveItem(me, itemId);
  }

  @Post('orders')
  placeOrder(@CurrentUser() me: AuthUser, @Body() dto: PlaceOrderDto): Promise<StoreOrderView> {
    return this.store.placeOrder(me, dto);
  }

  @Delete('orders/:id')
  cancelOrder(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.store.cancelOrder(me, id);
  }

  @Get('deliveries')
  deliveries(@CurrentUser() me: AuthUser): Promise<StoreDelivery[]> {
    return this.store.deliveries(me);
  }

  @Get('deliveries/:stopId')
  delivery(@CurrentUser() me: AuthUser, @Param('stopId') stopId: string): Promise<StoreDelivery> {
    return this.store.delivery(me, stopId);
  }

  @Post('deliveries/:stopId/receipt')
  @HttpCode(200)
  receipt(
    @CurrentUser() me: AuthUser,
    @Param('stopId') stopId: string,
    @Body() dto: ReceiptDto,
  ): Promise<StoreDelivery> {
    return this.store.receipt(me, stopId, dto);
  }

  @Get('notices')
  notices(@CurrentUser() me: AuthUser): Promise<StoreNotice[]> {
    return this.store.notices(me);
  }

  @Post('notices/:id/read')
  @HttpCode(200)
  markRead(@CurrentUser() me: AuthUser, @Param('id') id: string) {
    return this.store.markRead(me, id);
  }
}
