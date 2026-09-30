import { Module } from '@nestjs/common';
import { InAppNotifier } from './in-app.notifier';
import { NOTIFIER } from './notifier.interface';

@Module({
  providers: [InAppNotifier, { provide: NOTIFIER, useExisting: InAppNotifier }],
  exports: [NOTIFIER],
})
export class NotificationsModule {}
