import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoadsController } from './loads.controller';
import { LoadsService } from './loads.service';

@Module({
  imports: [NotificationsModule],
  controllers: [LoadsController],
  providers: [LoadsService],
  exports: [LoadsService],
})
export class LoadsModule {}
