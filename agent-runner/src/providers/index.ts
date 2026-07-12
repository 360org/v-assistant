/**
 * Provider barrel — each adapter self-registers on import.
 * Import this file to register all built-in providers.
 */
import './adapters/openai.js';
import './adapters/anthropic.js';
import './adapters/gemini.js';

export { createProvider, type ProviderName } from './factory.js';
export { registerProvider, getProviderFactory, listProviders } from './provider-registry.js';
export type {
  AgentProvider,
  AgentQuery,
  ProviderEvent,
  ProviderExchange,
  ProviderOptions,
  ProviderFactory,
  QueryInput,
  ToolDefinition,
  ToolCall,
  ToolResult,
  ChatMessage,
  McpServerConfig,
} from './types.js';
