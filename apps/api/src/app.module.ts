import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { SessionGuard } from './common/guards/session.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ClockService } from './common/clock/clock.service';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './orders/orders.module';
import { PlanModule } from './plan/plan.module';
import { TripsModule } from './trips/trips.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { LoadsModule } from './loads/loads.module';
import { StopsModule } from './stops/stops.module';
import { IncidentsModule } from './incidents/incidents.module';
import { SyncModule } from './sync/sync.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PhotosModule } from './photos/photos.module';
import { HealthModule } from './health/health.module';

@Global()
@Module({
  providers: [ClockService],
  exports: [ClockService],
})
class ClockModule {}

@Module({
  imports: [
    PrismaModule,
    ClockModule,
    AuthModule,
    OrdersModule,
    PlanModule,
    TripsModule,
    VehiclesModule,
    LoadsModule,
    StopsModule,
    IncidentsModule,
    SyncModule,
    NotificationsModule,
    PhotosModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
