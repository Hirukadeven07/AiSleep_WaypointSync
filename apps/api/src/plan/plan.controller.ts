import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import type {
  AssignResult,
  AutoAssignProposal,
  BringBackResult,
  DeferPreview,
  DeferResult,
  DropCheck,
  NewTripOptions,
  PlanDay,
  PlanMap,
  PlanOrderDetail,
  PlanPublishResult,
  PlanTrip,
  PublishCheck,
  TripSuggestion,
  UnassignResult,
} from '@waypoint/contracts';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateTripDto,
  DeferDto,
  DropDto,
  OrderIdDto,
  PublishDto,
  UnassignDto,
} from './dto/drop.dto';
import { PlaceStoreDto } from './dto/place-store.dto';
import { MapService } from '../map/map.service';
import { PlanAutoService } from './plan-auto.service';
import { PlanDeferService } from './plan-defer.service';
import { PlanEditService } from './plan-edit.service';
import { PlanPublishService } from './plan-publish.service';
import { PlanTripsService } from './plan-trips.service';
import { PlanService } from './plan.service';

@Controller('plan')
@Roles('dispatcher')
export class PlanController {
  constructor(
    private readonly plan: PlanService,
    private readonly edit: PlanEditService,
    private readonly defer: PlanDeferService,
    private readonly trips: PlanTripsService,
    private readonly publishing: PlanPublishService,
    private readonly auto: PlanAutoService,
    private readonly maps: MapService,
  ) {}

  /** The plan board for a service day (defaults to tomorrow). */
  @Get()
  day(@CurrentUser() me: AuthUser, @Query('date') date?: string): Promise<PlanDay> {
    return this.plan.day(me, date);
  }

  /** Store pins for the planning map. Same day as the board. */
  @Get('map')
  map(@CurrentUser() me: AuthUser, @Query('date') date?: string): Promise<PlanMap> {
    return this.maps.plan(me, date);
  }

  /** Set the coordinates the dispatcher clicked for a store. */
  @Post('stores/:storeId/location')
  @HttpCode(200)
  placeStore(
    @CurrentUser() me: AuthUser,
    @Param('storeId') storeId: string,
    @Body() dto: PlaceStoreDto,
  ) {
    return this.maps.placeStore(me, storeId, dto.lat, dto.lng);
  }

  @Get('orders/:id')
  order(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<PlanOrderDetail> {
    return this.edit.orderDetail(me, id);
  }

  /** What dropping an order on a trip would do. Saves nothing. */
  @Post('check')
  @HttpCode(200)
  check(@CurrentUser() me: AuthUser, @Body() dto: DropDto): Promise<DropCheck> {
    return this.edit.check(me, dto.orderId, dto.tripId);
  }

  /** Put an order on a trip (or move it from another trip). Hard-rule breaks answer 409 with the reason code. */
  @Post('assign')
  @HttpCode(200)
  assign(@CurrentUser() me: AuthUser, @Body() dto: DropDto): Promise<AssignResult> {
    return this.edit.assign(me, dto.orderId, dto.tripId);
  }

  /** Take an order off its trip; it goes back to waiting. */
  @Post('unassign')
  @HttpCode(200)
  unassign(@CurrentUser() me: AuthUser, @Body() dto: UnassignDto): Promise<UnassignResult> {
    return this.edit.unassign(me, dto.orderId);
  }

  /** What moving an order to a later day would do, and the message the store would get. */
  @Post('defer/preview')
  @HttpCode(200)
  deferPreview(@CurrentUser() me: AuthUser, @Body() dto: DeferDto): Promise<DeferPreview> {
    return this.defer.preview(me, dto.orderId, dto.reason);
  }

  /** Move an order to the next operating day and tell the store why. */
  @Post('defer')
  @HttpCode(200)
  deferOrder(@CurrentUser() me: AuthUser, @Body() dto: DeferDto): Promise<DeferResult> {
    return this.defer.defer(me, dto.orderId, dto.reason);
  }

  @Post('bring-back')
  @HttpCode(200)
  bringBack(@CurrentUser() me: AuthUser, @Body() dto: OrderIdDto): Promise<BringBackResult> {
    return this.defer.bringBack(me, dto.orderId);
  }

  @Get('trips/options')
  tripOptions(@CurrentUser() me: AuthUser, @Query('date') date?: string): Promise<NewTripOptions> {
    return this.trips.options(me, date);
  }

  @Post('trips')
  @HttpCode(200)
  createTrip(@CurrentUser() me: AuthUser, @Body() dto: CreateTripDto): Promise<PlanTrip> {
    return this.trips.create(me, dto);
  }

  /** Waiting orders the rules let onto this trip. */
  @Get('trips/:id/suggestions')
  suggestions(@CurrentUser() me: AuthUser, @Param('id') id: string): Promise<TripSuggestion[]> {
    return this.trips.suggestions(me, id);
  }

  /** What would stop or warn on publish. Saves nothing. */
  @Post('publish/check')
  @HttpCode(200)
  publishCheck(@CurrentUser() me: AuthUser, @Body() dto: PublishDto): Promise<PublishCheck> {
    return this.publishing.check(me, dto.date);
  }

  /** Send the plan. Capacity problems refuse with 409; other warnings need `anyway`. */
  @Post('publish')
  @HttpCode(200)
  publish(@CurrentUser() me: AuthUser, @Body() dto: PublishDto): Promise<PlanPublishResult> {
    return this.publishing.publish(me, dto.anyway === true, dto.date);
  }

  /** What Auto-assign would do. Saves nothing. */
  @Post('auto-assign')
  @HttpCode(200)
  autoAssign(@CurrentUser() me: AuthUser, @Body() dto: PublishDto): Promise<AutoAssignProposal> {
    return this.auto.propose(me, dto.date);
  }

  @Post('auto-assign/apply')
  @HttpCode(200)
  applyAutoAssign(
    @CurrentUser() me: AuthUser,
    @Body() dto: PublishDto,
  ): Promise<AutoAssignProposal> {
    return this.auto.apply(me, dto.date);
  }
}
