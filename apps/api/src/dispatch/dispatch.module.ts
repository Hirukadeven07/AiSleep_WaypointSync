import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [NotificationsModule],
  controllers: [DispatchController],
  providers: [DispatchService],
})
export class DispatchModule {}
