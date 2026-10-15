import { Controller, MessageEvent, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NoticeHub } from './notice-hub';

/** Live notices for whoever is signed in. Dispatcher, store, driver and loader all use this. */
@Controller('notices')
export class NoticesController {
  constructor(private readonly hub: NoticeHub) {}

  @Sse('live')
  live(@CurrentUser() me: AuthUser): Observable<MessageEvent> {
    return this.hub.stream(me.id);
  }
}
