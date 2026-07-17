/**
 * Provider factory — creates a provider instance by name.
 *
 * @ref NanoClaw/container/agent-runner/src/providers/factory.ts
 */
import type { AgentProvider, ProviderOptions } from './types.js';
import { getProviderFactory } from './provider-registry.js';

export type ProviderName = string;

export function createProvider(name: ProviderName, options: ProviderOptions = {}): AgentProvider {
  return getProviderFactory(name)(options);
}
