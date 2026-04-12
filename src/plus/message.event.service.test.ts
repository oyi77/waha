import { MessageEventService, MessageHandler } from './message.event.service';

describe('MessageEventService', () => {
  let service: MessageEventService;

  beforeEach(() => {
    service = new MessageEventService();
  });

  //
  // register
  //

  describe('register', () => {
    it('adds a handler that is later called by emit', async () => {
      const calls: string[] = [];
      const handler: MessageHandler = async (
        session,
        chatId,
        text,
        direction,
      ) => {
        calls.push(`${session}:${chatId}:${text}:${direction}`);
      };

      service.register(handler);
      await service.emit('s1', 'c1', 'hello', 'incoming');

      expect(calls).toEqual(['s1:c1:hello:incoming']);
    });

    it('supports multiple handlers', async () => {
      let countA = 0;
      let countB = 0;
      service.register(async () => {
        countA++;
      });
      service.register(async () => {
        countB++;
      });

      await service.emit('s', 'c', 't', 'incoming');

      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });
  });

  //
  // emit
  //

  describe('emit', () => {
    it('passes all arguments to handlers', async () => {
      let received: unknown[] = [];
      service.register(async (session, chatId, text, direction, raw) => {
        received = [session, chatId, text, direction, raw];
      });

      const rawPayload = { key: 'value' };
      await service.emit('sess', 'chat@c.us', 'hi', 'outgoing', rawPayload);

      expect(received).toEqual([
        'sess',
        'chat@c.us',
        'hi',
        'outgoing',
        rawPayload,
      ]);
    });

    it('defaults direction to incoming', async () => {
      let capturedDirection: string | undefined;
      service.register(async (_session, _chatId, _text, direction) => {
        capturedDirection = direction;
      });

      await service.emit('s', 'c', 't');

      expect(capturedDirection).toBe('incoming');
    });

    it('does not throw when no handlers are registered', async () => {
      await expect(
        service.emit('s', 'c', 't', 'incoming'),
      ).resolves.toBeUndefined();
    });

    it('uses Promise.allSettled — a failing handler does not prevent others from running', async () => {
      const calls: number[] = [];

      service.register(async () => {
        calls.push(1);
      });
      service.register(async () => {
        throw new Error('boom');
      });
      service.register(async () => {
        calls.push(3);
      });

      await service.emit('s', 'c', 't', 'incoming');

      expect(calls).toEqual([1, 3]);
    });

    it('raw parameter is optional and defaults to undefined', async () => {
      let capturedRaw: unknown = 'sentinel';
      service.register(async (_s, _c, _t, _d, raw) => {
        capturedRaw = raw;
      });

      await service.emit('s', 'c', 't', 'incoming');

      expect(capturedRaw).toBeUndefined();
    });

    it('calls handlers in registration order', async () => {
      const order: number[] = [];

      service.register(async () => {
        order.push(1);
      });
      service.register(async () => {
        order.push(2);
      });
      service.register(async () => {
        order.push(3);
      });

      await service.emit('s', 'c', 't', 'incoming');

      expect(order).toEqual([1, 2, 3]);
    });
  });
});
