// Manual mock for the camunda-external-task-client-js library. Jest will
// automatically use this file when the module is imported in tests.

export class Client {
  private subs: Record<string, Function> = {};

  /**
   * Register a topic subscription. The handler is stored and can be
   * triggered manually in tests via the `__trigger` helper.
   */
  subscribe(topic: string, handler: Function): void {
    this.subs[topic] = handler;
  }

  /**
   * Trigger a subscribed handler. This utility is used by tests to
   * simulate Camunda delivering an external task to the worker. It
   * executes the handler with a fake payload.
   */
  __trigger(topic: string, payload: any): any {
    const handler = this.subs[topic];
    if (!handler) {
      throw new Error(`No subscriber for topic ${topic}`);
    }
    return handler(payload);
  }
}

// Provide a noop logger. The real client attaches a console logger but
// tests do not need this functionality.
export const logger = {};

/**
 * Variables class stub. It stores key-value pairs and exposes an
 * accessor used by the taskService.complete implementation in tests.
 */
export class Variables {
  private map = new Map<string, any>();
  set(key: string, value: unknown): void {
    this.map.set(key, value);
  }
  getAll(): Record<string, unknown> {
    return Object.fromEntries(this.map.entries());
  }
}

// Stub types for Task and TaskService to satisfy imports.
export type Task = any;
export type TaskService = any;