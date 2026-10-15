import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';

/** A saved notice, plus the user it belongs to, ready to push. */
export interface RaisedNotice {
  userId: string;
  id: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
}

export function toRaisedNotice(row: {
  userId: string;
  id: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
}): RaisedNotice {
  return {
    userId: row.userId,
    id: row.id,
    title: row.title,
    body: row.body,
    link: row.link,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * In-process fan-out for notices that were just committed. One API process is enough:
 * each signed-in browser holds its own stream, and a second process would not see these.
 */
@Injectable()
export class NoticeHub {
  private readonly listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  publish(notice: RaisedNotice): void {
    const { userId, ...live } = notice;
    const event: MessageEvent = { data: live };
    for (const send of this.listeners.get(userId) ?? []) send(event);
  }

  publishAll(notices: RaisedNotice[]): void {
    for (const notice of notices) this.publish(notice);
  }

  /** Server-sent events for one user, with a comment-like ping so proxies keep the stream open. */
  stream(userId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const send = (event: MessageEvent) => subscriber.next(event);
      let set = this.listeners.get(userId);
      if (!set) {
        set = new Set();
        this.listeners.set(userId, set);
      }
      set.add(send);
      const ping = setInterval(() => subscriber.next({ type: 'ping', data: {} }), 20_000);
      return () => {
        clearInterval(ping);
        set!.delete(send);
        if (set!.size === 0) this.listeners.delete(userId);
      };
    });
  }
}
