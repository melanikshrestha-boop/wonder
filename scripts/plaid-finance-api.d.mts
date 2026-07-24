import type { Plugin } from "vite";

export function plaidFinanceApi(opts?: {
  env?: Record<string, string>;
}): Plugin;
