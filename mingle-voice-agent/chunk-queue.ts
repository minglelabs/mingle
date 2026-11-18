// Single-consumer async queue: the producer pushes audio as it streams in,
// the lane drains it when its turn comes (buffered chunks first, then live).
export class ChunkQueue<T> implements AsyncIterable<T> {
    private items: T[] = [];
    private ended = false;
    private failure: unknown = null;
    private wake: (() => void) | null = null;

    push(item: T): void {
        this.items.push(item);
        this.notify();
    }

    end(): void {
        this.ended = true;
        this.notify();
    }

    fail(error: unknown): void {
        this.failure = error;
        this.ended = true;
        this.notify();
    }

    private notify(): void {
        const wake = this.wake;
        this.wake = null;
        wake?.();
    }

    async *[Symbol.asyncIterator](): AsyncIterator<T> {
        while (true) {
            if (this.items.length) {
                yield this.items.shift() as T;
                continue;
            }
            if (this.failure) throw this.failure;
            if (this.ended) return;
            await new Promise<void>((resolve) => { this.wake = resolve; });
        }
    }
}
