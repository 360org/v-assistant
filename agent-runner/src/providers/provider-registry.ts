/**
 * Provider registry — dynamic registration pattern.
 *
 * Each provider module self-registers on import.
 * The factory looks up the registered provider by name.
 *
 * @ref NanoClaw/container/agent-runner/src/providers/provider-registry.ts
 */
import type { ProviderFactory } from './types.js';

const registry = new Map<string, ProviderFactory>();

/**
 * Register a provider factory under a given name.
 * Called by each provider module at import time.
 */
export function registerProvider(name: string, factory: ProviderFactory): void {
  registry.set(name.toLowerCase(), factory);
}

/**
 * Get the factory for a registered provider.
 * Throws if the provider is not registered.
 */
export function getProviderFactory(name: string): ProviderFactory {
  const factory = registry.get(name.toLowerCase());
  if (!factory) {
    const available = Array.from(registry.keys()).join(', ');
    throw new Error(`Unknown provider "${name}". Available: ${available || '(none)'}`);
  }
  return factory;
}

/**
 * List all registered provider names.
 */
export function listProviders(): string[] {
  return Array.from(registry.keys());
}
