import { Module } from '@nestjs/common';
import { InAppNotifier } from './in-app.notifier';
import { NoticeHub } from './notice-hub';
import { NoticesController } from './notices.controller';
import { NOTIFIER } from './notifier.interface';

@Module({
  controllers: [NoticesController],
  providers: [NoticeHub, InAppNotifier, { provide: NOTIFIER, useExisting: InAppNotifier }],
  exports: [NOTIFIER, NoticeHub],
})
export class NotificationsModule {}
