/**
 * Per-key serial queue. Work for the same key (e.g. one WhatsApp user) runs strictly in order;
 * different keys run concurrently. Used so slow OCR never blocks the webhook acknowledgement
 * and so two quick messages from one user cannot race on the conversation state.
 */
export class KeyedQueue {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(task);
    this.tails.set(key, next);
    next
      .finally(() => {
        if (this.tails.get(key) === next) this.tails.delete(key);
      })
      .catch(() => undefined);
    return next;
  }

  get size() {
    return this.tails.size;
  }
}

export const conversationQueue = new KeyedQueue();
