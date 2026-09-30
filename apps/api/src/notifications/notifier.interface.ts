export interface NotificationInput {
  userId: string;
  title: string;
  body: string;
  link?: string;
}

export interface Notifier {
  notify(input: NotificationInput): Promise<void>;
}

export const NOTIFIER = Symbol('NOTIFIER');
