import { Injectable, Logger } from '@nestjs/common';

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
  private readonly logger = new Logger(MessageEventService.name);
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
  ): Promise<void> {
    const results = await Promise.allSettled(
      this.handlers.map((h) => h(session, chatId, text, direction, raw)),
    );
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected') {
        this.logger.error(`MessageEventService handler[${i}] error: ${r.reason?.message ?? r.reason}`);
      }
    }
  }
}
