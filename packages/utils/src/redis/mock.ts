import type { RedisClientType } from "redis";
import { vi } from "vitest";

/**
 * Creates a mock Redis client for testing purposes.
 * This mock simulates common Redis operations in-memory.
 */
export function createMockRedis() {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  const mock = {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) || null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    setEx: vi.fn((key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return Promise.resolve("OK");
    }),
    exists: vi.fn((key: string) => Promise.resolve(store.has(key) ? 1 : 0)),
    sMembers: vi.fn((key: string) => {
      const set = sets.get(key);
      return Promise.resolve(set ? Array.from(set) : []);
    }),
    scan: vi.fn((cursor: string | number, options?: { MATCH?: string; COUNT?: number }) => {
      const numericCursor = typeof cursor === "string" ? Number(cursor) : cursor;

      if (numericCursor !== 0) {
        return Promise.resolve({ cursor: 0, keys: [] });
      }

      const pattern = options?.MATCH || "*";
      const regex = new RegExp(`^${pattern.replace(/\*/g, "[^:]*")}$`);
      const matchedKeys: string[] = [];

      for (const key of store.keys()) {
        if (regex.test(key)) {
          matchedKeys.push(key);
        }
      }

      return Promise.resolve({
        cursor: 0,
        keys: matchedKeys,
      });
    }),
    multi: vi.fn(() => {
      const commands: Array<{ cmd: string; args: unknown[] }> = [];
      const multi = {
        get: vi.fn(function (key: string) {
          commands.push({ cmd: "get", args: [key] });
          return multi;
        }),
        exists: vi.fn(function (key: string) {
          commands.push({ cmd: "exists", args: [key] });
          return multi;
        }),
        setEx: vi.fn(function (key: string, ttl: number, value: string) {
          commands.push({ cmd: "setEx", args: [key, ttl, value] });
          return multi;
        }),
        exec: vi.fn(async () => {
          const results: unknown[] = [];
          for (const command of commands) {
            if (command.cmd === "get") {
              results.push(store.get(command.args[0] as string) || null);
            } else if (command.cmd === "exists") {
              results.push(store.has(command.args[0] as string) ? 1 : 0);
            } else if (command.cmd === "setEx") {
              store.set(command.args[0] as string, command.args[2] as string);
              results.push("OK");
            }
          }
          return results;
        }),
      };
      return multi;
    }),
    // Helper methods for tests
    _store: store,
    _sets: sets,
    _setGuildSettings: (guildId: string, settings: object) => {
      store.set(`guilds:${guildId}:settings`, JSON.stringify(settings));
    },
    _setGalleryMeta: (guildId: string, galleryName: string, meta: object) => {
      store.set(`guild:${guildId}:gallery:${galleryName}:meta`, JSON.stringify(meta));
    },
    _addGalleryToGuild: (guildId: string, galleryName: string) => {
      if (!sets.has(`guild:${guildId}:galleries`)) {
        sets.set(`guild:${guildId}:galleries`, new Set());
      }
      sets.get(`guild:${guildId}:galleries`)!.add(galleryName);
    },
    _clear: () => {
      store.clear();
      sets.clear();
    },
  };

  return mock as unknown as RedisClientType & typeof mock;
}

export type MockRedisClient = ReturnType<typeof createMockRedis>;
