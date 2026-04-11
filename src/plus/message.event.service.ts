import { Injectable } from '@nestjs/common';

export type MessageDirection = 'incoming' | 'outgoing';

export type MessageHandler = (
  session: string,
  chatId: string,
  text: string,
  direction: MessageDirection,
  raw?: any,
) => Promise<void>;

@Injectable()
export class MessageEventService {
  private handlers: MessageHandler[] = [];

  register(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  async emit(
    session: string,
    chatId: string,
    text: string,
    direction: MessageDirection = 'incoming',
    raw?: any,
  ) {
    for (const h of this.handlers) {
      await h(session, chatId, text, direction, raw).catch(() => {});
    }
  }
}
