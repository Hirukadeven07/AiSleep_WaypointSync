import { NoticeHub, type RaisedNotice } from './notice-hub';

const notice = (userId: string, id: string): RaisedNotice => ({
  userId,
  id,
  title: 'Waiting 10 min at Store',
  body: 'The store has not checked the goods.',
  link: '/dispatch',
  createdAt: '2026-10-03T12:00:00.000Z',
});

describe('NoticeHub', () => {
  it('pushes a committed notice only to that user, and stops after they disconnect', () => {
    const hub = new NoticeHub();
    const mine: unknown[] = [];
    const other: unknown[] = [];
    const mineSub = hub.stream('dispatcher').subscribe((event) => mine.push(event.data));
    const otherSub = hub.stream('driver').subscribe((event) => other.push(event.data));

    hub.publish(notice('driver', 'n1'));

    expect(mine).toEqual([]);
    expect(other).toEqual([
      {
        id: 'n1',
        title: 'Waiting 10 min at Store',
        body: 'The store has not checked the goods.',
        link: '/dispatch',
        createdAt: '2026-10-03T12:00:00.000Z',
      },
    ]);

    otherSub.unsubscribe();
    hub.publishAll([notice('driver', 'n2'), notice('dispatcher', 'n3')]);
    expect(other).toHaveLength(1);
    expect(mine).toEqual([
      expect.objectContaining({ id: 'n3' }),
    ]);
    mineSub.unsubscribe();
  });
});
