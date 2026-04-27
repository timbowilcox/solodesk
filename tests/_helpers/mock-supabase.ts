import { vi } from "vitest";

export type SupabaseResponse<T = unknown> = { data: T | null; error: unknown };

export function makeChainableSupabase(
  responses: Partial<Record<string, SupabaseResponse>> = {},
) {
  const defaultResponse: SupabaseResponse = { data: null, error: null };
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.update = vi.fn(() => chain);
  chain.delete = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.range = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => defaultResponse);
  chain.single = vi.fn(async () => defaultResponse);
  chain.then = undefined;
  return {
    from: vi.fn((table: string) => {
      const response = responses[table] ?? defaultResponse;
      const tableChain = { ...chain };
      tableChain.maybeSingle = vi.fn(async () => response);
      tableChain.single = vi.fn(async () => response);
      // Restore self-referential chain returns
      tableChain.select = vi.fn(() => tableChain);
      tableChain.insert = vi.fn(() => tableChain);
      tableChain.update = vi.fn(() => tableChain);
      tableChain.eq = vi.fn(() => tableChain);
      tableChain.order = vi.fn(() => tableChain);
      tableChain.range = vi.fn(() => tableChain);
      tableChain.limit = vi.fn(() => tableChain);
      return tableChain;
    }),
  };
}
