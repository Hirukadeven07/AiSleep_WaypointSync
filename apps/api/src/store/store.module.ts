import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

@Module({
  imports: [NotificationsModule],
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule {}
