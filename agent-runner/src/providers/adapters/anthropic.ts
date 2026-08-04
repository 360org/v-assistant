/**
 * Anthropic Claude provider adapter.
 *
 * Uses direct HTTP API calls to Anthropic Messages API.
 * NO Claude Agent SDK dependency — pure API.
 * Supports streaming (SSE) and tool use.
 */
import { registerProvider } from '../provider-registry.js';
import type {
  AgentProvider,
  AgentQuery,
  ProviderEvent,
  ProviderOptions,
  QueryInput,
  ToolDefinition,
} from '../types.js';

function log(msg: string): void {
  console.error(`[provider/anthropic] ${msg}`);
}

const MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;

function retryAfterMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const retryAt = Date.parse(retryAfter);
    if (!Number.isNaN(retryAt)) return Math.max(0, retryAt - Date.now());
  }
  return DEFAULT_RETRY_DELAY_MS * 2 ** attempt;
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, init);
      const retryable = response.status === 429 || response.status === 529;
      if (!retryable || attempt === MAX_RETRIES) return response;

      await new Promise<void>((resolve) => setTimeout(resolve, retryAfterMs(response, attempt)));
    } catch (e) {
      if (attempt === MAX_RETRIES) throw e;
      const delay = DEFAULT_RETRY_DELAY_MS * 2 ** attempt;
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function createAnthropicProvider(options: ProviderOptions): AgentProvider {
  const apiKey = options.apiKey || '';
  const baseUrl = (options.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const model = options.model || 'claude-sonnet-5';

  return {
    name: 'anthropic',
    usesMemoryScaffold: true,

    query(input: QueryInput): AgentQuery {
      let aborted = false;
      const abortController = new AbortController();

      // Build messages array for Anthropic format
      const messages: Array<Record<string, unknown>> = [];

      if (input.messages) {
        for (const msg of input.messages) {
          if (msg.role === 'system') continue; // System goes in separate field
          messages.push({
            role: msg.role === 'tool' ? 'user' : msg.role,
            content: msg.role === 'tool'
              ? [{ type: 'tool_result', tool_use_id: msg.tool_call_id, content: msg.content }]
              : msg.content,
          });
        }
      }

      if (input.prompt) {
        messages.push({ role: 'user', content: input.prompt });
      }

      // Ensure messages alternate user/assistant
      if (messages.length === 0) {
        messages.push({ role: 'user', content: '(empty)' });
      }

      // Build request body
      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: 8192,
        stream: true,
      };

      // System prompt
      if (input.systemContext?.instructions) {
        body.system = input.systemContext.instructions;
      }

      // Tools
      if (input.tools && input.tools.length > 0) {
        body.tools = input.tools.map((t: ToolDefinition) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        }));
      }

      async function* streamEvents(): AsyncIterable<ProviderEvent> {
        yield { type: 'init', continuation: '' };

        try {
          const response = await fetchWithRetry(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(body),
            signal: abortController.signal,
          });

          if (!response.ok) {
            const errText = await response.text();
            const retryable = response.status === 429 || response.status >= 500;
            yield { type: 'error', message: `Anthropic API error ${response.status}: ${errText}`, retryable };
            return;
          }

          if (!response.body) {
            yield { type: 'error', message: 'No response body', retryable: false };
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullText = '';
          let currentToolId = '';
          let currentToolName = '';
          let currentToolArgs = '';

          while (!aborted) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();

              if (trimmed.startsWith('event: ')) {
                // Anthropic SSE uses event: prefix
                continue;
              }

              if (!trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);

              try {
                const event = JSON.parse(data);
                yield { type: 'activity' };

                switch (event.type) {
                  case 'content_block_start': {
                    if (event.content_block?.type === 'tool_use') {
                      currentToolId = event.content_block.id || '';
                      currentToolName = event.content_block.name || '';
                      currentToolArgs = '';
                    }
                    break;
                  }

                  case 'content_block_delta': {
                    if (event.delta?.type === 'text_delta' && event.delta.text) {
                      fullText += event.delta.text;
                      yield { type: 'text_delta', text: event.delta.text };
                    }
                    if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
                      currentToolArgs += event.delta.partial_json;
                    }
                    break;
                  }

                  case 'content_block_stop': {
                    if (currentToolName) {
                      try {
                        const args = currentToolArgs ? JSON.parse(currentToolArgs) : {};
                        yield {
                          type: 'tool_call',
                          toolCall: {
                            id: currentToolId,
                            name: currentToolName,
                            arguments: args,
                          },
                        };
                      } catch {
                        log(`Failed to parse tool args: ${currentToolArgs}`);
                      }
                      currentToolId = '';
                      currentToolName = '';
                      currentToolArgs = '';
                    }
                    break;
                  }

                  case 'message_stop': {
                    yield { type: 'result', text: fullText || null };
                    break;
                  }

                  case 'error': {
                    yield {
                      type: 'error',
                      message: event.error?.message || 'Unknown Anthropic error',
                      retryable: event.error?.type === 'overloaded_error',
                    };
                    break;
                  }
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        } catch (err) {
          if (aborted) return;
          const message = err instanceof Error ? err.message : String(err);
          yield { type: 'error', message, retryable: true };
        }
      }

      return {
        push(_message: string) {},
        end() {},
        events: streamEvents(),
        abort() {
          aborted = true;
          abortController.abort();
        },
      };
    },

    isSessionInvalid(err: unknown): boolean {
      if (err instanceof Error) {
        return err.message.includes('invalid_request_error');
      }
      return false;
    },
  };
}

registerProvider('anthropic', createAnthropicProvider);
registerProvider('claude', createAnthropicProvider);
