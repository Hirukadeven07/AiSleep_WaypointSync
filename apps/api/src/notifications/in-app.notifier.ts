import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import type { NotificationInput, Notifier } from './notifier.interface';

/** Stores notifications in the database; clients pick them up by polling. */
@Injectable()
export class InAppNotifier implements Notifier {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotificationInput): Promise<void> {
    await this.prisma.notification.create({
      data: { userId: input.userId, title: input.title, body: input.body, link: input.link },
    });
  }
}
