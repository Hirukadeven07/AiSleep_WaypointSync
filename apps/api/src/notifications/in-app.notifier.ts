import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { NoticeHub, toRaisedNotice } from './notice-hub';
import type { NotificationInput, Notifier } from './notifier.interface';

/** Stores a notification, then pushes it to that user's open session. */
@Injectable()
export class InAppNotifier implements Notifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hub: NoticeHub,
  ) {}

  async notify(input: NotificationInput): Promise<void> {
    const row = await this.prisma.notification.create({
      data: { userId: input.userId, title: input.title, body: input.body, link: input.link },
    });
    this.hub.publish(toRaisedNotice(row));
  }
}
