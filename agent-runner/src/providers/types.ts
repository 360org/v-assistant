/**
 * Universal provider types — shared interfaces for all AI providers.
 *
 * Defines the contract that every provider adapter must implement.
 * Decoupled from any specific SDK.
 *
 * @ref NanoClaw/container/agent-runner/src/providers/types.ts
 */

/** Tool definition for function calling */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Tool call from the model */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Tool result to send back to the model */
export interface ToolResult {
  tool_call_id: string;
  content: string;
  is_error?: boolean;
}

/** Chat message in the conversation */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/** Query input to a provider */
export interface QueryInput {
  /** User prompt (already formatted by runner). */
  prompt: string;
  /** Full conversation history for context. */
  messages?: ChatMessage[];
  /** Opaque continuation token from a previous query. */
  continuation?: string;
  /** System instructions to inject. */
  systemContext?: {
    instructions?: string;
  };
  /** Available tools for this query. */
  tools?: ToolDefinition[];
}

/** Events emitted by a provider during query execution */
export type ProviderEvent =
  | { type: 'init'; continuation: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; toolCall: ToolCall }
  | { type: 'result'; text: string | null; isError?: boolean }
  | { type: 'error'; message: string; retryable: boolean; classification?: string }
  | { type: 'progress'; message: string }
  | { type: 'activity' };

/** One prompt/result round-trip */
export interface ProviderExchange {
  prompt: string;
  result: string | null;
  continuation?: string;
  status: 'completed' | 'undelivered' | 'error';
}

/** Active query handle */
export interface AgentQuery {
  /** Push a follow-up message into the active query. */
  push(message: string): void;
  /** Signal that no more input will be sent. */
  end(): void;
  /** Output event stream. */
  events: AsyncIterable<ProviderEvent>;
  /** Force-stop the query. */
  abort(): void;
}

/** Provider constructor options */
export interface ProviderOptions {
  /** API key for auth */
  apiKey?: string;
  /** Base URL override */
  baseUrl?: string;
  /** Model ID or alias */
  model?: string;
  /** Assistant display name */
  assistantName?: string;
  /** MCP servers config */
  mcpServers?: Record<string, McpServerConfig>;
  /** Environment variables */
  env?: Record<string, string | undefined>;
}

export interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Universal Agent Provider interface.
 *
 * Every AI provider adapter must implement this interface.
 * The runner is completely agnostic to the underlying API/SDK.
 */
export interface AgentProvider {
  /** Provider name identifier */
  readonly name: string;

  /**
   * When true, the runner creates a persistent memory/ tree at boot.
   * @ref NanoClaw providers/types.ts — usesMemoryScaffold
   */
  readonly usesMemoryScaffold?: boolean;

  /**
   * Send a query to the provider and get streaming events back.
   * This is the core method — handles tool calling loop internally.
   */
  query(input: QueryInput): AgentQuery;

  /**
   * True if the given error indicates the stored continuation is invalid.
   */
  isSessionInvalid(err: unknown): boolean;

  /**
   * Optional: called after each completed exchange.
   */
  onExchangeComplete?(exchange: ProviderExchange): void;
}

/** Factory function type for creating providers */
export type ProviderFactory = (options: ProviderOptions) => AgentProvider;
