/**
 * Google Gemini provider adapter.
 *
 * Uses direct HTTP API calls to Gemini streamGenerateContent.
 * NO Google SDK dependency — pure API.
 * Supports streaming and function calling.
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
  console.error(`[provider/gemini] ${msg}`);
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

export function createGeminiProvider(options: ProviderOptions): AgentProvider {
  const apiKey = options.apiKey || '';
  const model = options.model || 'gemini-2.5-flash';
  const baseUrl = (options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');

  return {
    name: 'gemini',
    usesMemoryScaffold: true,

    query(input: QueryInput): AgentQuery {
      let aborted = false;
      const abortController = new AbortController();

      // Build Gemini contents array
      const contents: Array<Record<string, unknown>> = [];

      if (input.messages) {
        for (const msg of input.messages) {
          if (msg.role === 'system') continue;
          contents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          });
        }
      }

      if (input.prompt) {
        contents.push({
          role: 'user',
          parts: [{ text: input.prompt }],
        });
      }

      // Build request body
      const body: Record<string, unknown> = { contents };

      // System instruction
      if (input.systemContext?.instructions) {
        body.system_instruction = {
          parts: [{ text: input.systemContext.instructions }],
        };
      }

      // Tools (function declarations)
      if (input.tools && input.tools.length > 0) {
        body.tools = [{
          function_declarations: input.tools.map((t: ToolDefinition) => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema,
          })),
        }];
      }

      const url = `${baseUrl}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

      async function* streamEvents(): AsyncIterable<ProviderEvent> {
        yield { type: 'init', continuation: '' };

        try {
          const response = await fetchWithRetry(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: abortController.signal,
          });

          if (!response.ok) {
            const errText = await response.text();
            const retryable = response.status === 429 || response.status >= 500;
            yield { type: 'error', message: `Gemini API error ${response.status}: ${errText}`, retryable };
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

          while (!aborted) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;
              const data = trimmed.slice(6);

              try {
                const chunk = JSON.parse(data);
                yield { type: 'activity' };

                for (const candidate of chunk.candidates || []) {
                  for (const part of candidate.content?.parts || []) {
                    // Text content
                    if (part.text) {
                      fullText += part.text;
                      yield { type: 'text_delta', text: part.text };
                    }

                    // Function call
                    if (part.functionCall) {
                      yield {
                        type: 'tool_call',
                        toolCall: {
                          id: `gemini-fc-${Date.now()}`,
                          name: part.functionCall.name,
                          arguments: part.functionCall.args || {},
                        },
                      };
                    }
                  }
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }

          yield { type: 'result', text: fullText || null };
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

    isSessionInvalid(_err: unknown): boolean {
      return false;
    },
  };
}

registerProvider('gemini', createGeminiProvider);
registerProvider('google', createGeminiProvider);
