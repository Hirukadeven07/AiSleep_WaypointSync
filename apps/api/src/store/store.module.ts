import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PhotosModule } from '../photos/photos.module';
import { StoreController } from './store.controller';
import { StoreService } from './store.service';

@Module({
  imports: [NotificationsModule, PhotosModule],
  controllers: [StoreController],
  providers: [StoreService],
  exports: [StoreService],
})
export class StoreModule {}
