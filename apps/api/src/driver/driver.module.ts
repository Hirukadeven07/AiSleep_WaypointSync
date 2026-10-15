import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';

@Module({
  imports: [NotificationsModule],
  controllers: [DriverController],
  providers: [DriverService],
})
export class DriverModule {}
