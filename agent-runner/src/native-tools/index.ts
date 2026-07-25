/**
 * Native tool definitions and executor.
 *
 * Tools run directly on the host OS (no Docker container).
 * Each tool implements: name, description, input_schema, execute().
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { ToolDefinition, ToolResult } from '../providers/types.js';

function log(msg: string): void {
  console.error(`[native-tools] ${msg}`);
}

const WORKSPACE_ROOT = path.resolve(
  process.env.VUA_AGENT_WORKSPACE || path.join(process.env.VUA_DATA_DIR || '/tmp/v-assistant', 'workspace'),
);
const AI_ROUTER_URL = process.env.VUA_AI_ROUTER_URL || 'http://127.0.0.1:20128';

function workspacePath(input: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, input);
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(`${WORKSPACE_ROOT}${path.sep}`)) {
    throw new Error('Access denied: agent tools are restricted to the assigned workspace');
  }
  return resolved;
}

/** A native tool with its definition and executor */
export interface NativeTool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<string>;
}

// --- FileRead Tool ---
const fileReadTool: NativeTool = {
  definition: {
    name: 'file_read',
    description: 'Read the contents of a file from the filesystem.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or relative file path to read' },
        start_line: { type: 'number', description: 'Start line (1-indexed, inclusive)' },
        end_line: { type: 'number', description: 'End line (1-indexed, inclusive)' },
      },
      required: ['path'],
    },
  },
  async execute(args): Promise<string> {
    const filePath = workspacePath(args.path as string);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const startLine = args.start_line as number | undefined;
      const endLine = args.end_line as number | undefined;

      if (startLine || endLine) {
        const lines = content.split('\n');
        const start = (startLine || 1) - 1;
        const end = endLine || lines.length;
        return lines.slice(start, end).join('\n');
      }

      return content;
    } catch (err) {
      return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// --- FileWrite Tool ---
const fileWriteTool: NativeTool = {
  definition: {
    name: 'file_write',
    description: 'Write content to a file. Creates parent directories if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write to' },
        content: { type: 'string', description: 'Content to write' },
        append: { type: 'boolean', description: 'If true, append instead of overwrite' },
      },
      required: ['path', 'content'],
    },
  },
  async execute(args): Promise<string> {
    const filePath = workspacePath(args.path as string);
    const content = args.content as string;
    const append = args.append as boolean | undefined;
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (append) {
        fs.appendFileSync(filePath, content, 'utf8');
      } else {
        fs.writeFileSync(filePath, content, 'utf8');
      }
      return `Successfully wrote ${content.length} chars to ${filePath}`;
    } catch (err) {
      return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// --- FileEdit Tool ---
const fileEditTool: NativeTool = {
  definition: {
    name: 'file_edit',
    description: 'Search and replace text in a file. Finds exact matches of old_text and replaces with new_text.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to edit' },
        old_text: { type: 'string', description: 'Exact text to find and replace' },
        new_text: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  async execute(args): Promise<string> {
    const filePath = workspacePath(args.path as string);
    const oldText = args.old_text as string;
    const newText = args.new_text as string;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (!content.includes(oldText)) {
        return `Error: old_text not found in ${filePath}`;
      }
      const updated = content.replace(oldText, newText);
      fs.writeFileSync(filePath, updated, 'utf8');
      return `Successfully edited ${filePath}`;
    } catch (err) {
      return `Error editing file: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// --- Grep Tool ---
const grepTool: NativeTool = {
  definition: {
    name: 'grep',
    description: 'Search file contents using ripgrep-style pattern matching. Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex)' },
        path: { type: 'string', description: 'Directory or file to search in' },
        include: { type: 'string', description: 'Glob pattern to filter files (e.g. "*.ts")' },
        case_insensitive: { type: 'boolean', description: 'Case insensitive search' },
      },
      required: ['pattern', 'path'],
    },
  },
  async execute(args): Promise<string> {
    const pattern = args.pattern as string;
    const searchPath = workspacePath(args.path as string);
    const include = args.include as string | undefined;
    const caseInsensitive = args.case_insensitive as boolean | undefined;

    const grepArgs = ['-rnI', '--color=never'];
    if (caseInsensitive) grepArgs.push('-i');
    if (include) grepArgs.push(`--include=${include}`);
    grepArgs.push(pattern, searchPath);

    try {
      const output = execFileSync('grep', grepArgs, {
        encoding: 'utf8',
        maxBuffer: 512 * 1024,
        timeout: 10000,
      });
      const lines = output.trim().split('\n');
      if (lines.length > 50) {
        return lines.slice(0, 50).join('\n') + `\n... (${lines.length - 50} more matches)`;
      }
      return output || '(no matches)';
    } catch {
      return '(no matches)';
    }
  },
};

// --- Glob Tool ---
const globTool: NativeTool = {
  definition: {
    name: 'glob',
    description: 'List files matching a glob pattern.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "src/**/*.ts")' },
        cwd: { type: 'string', description: 'Working directory for the glob' },
      },
      required: ['pattern'],
    },
  },
  async execute(args): Promise<string> {
    const pattern = args.pattern as string;
    const cwd = workspacePath((args.cwd as string) || '.');

    try {
      const output = execFileSync('find', [cwd, '-type', 'f'], {
        encoding: 'utf8', maxBuffer: 256 * 1024, timeout: 10000,
      });
      const suffix = pattern.startsWith('*.') ? pattern.slice(1) : null;
      const files = output.trim().split('\n').filter(Boolean).filter((file) =>
        suffix ? file.endsWith(suffix) : file.includes(pattern.replaceAll('*', ''))
      );
      return files.slice(0, 100).join('\n') || '(no matches)';
    } catch {
      return '(no matches)';
    }
  },
};

// --- HTTP Request Tool ---
const httpRequestTool: NativeTool = {
  definition: {
    name: 'http_request',
    description: 'Make an unauthenticated HTTP request. Credentialed operations must use an installed connector or gateway capability.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to request' },
        method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE)', default: 'GET' },
        headers: { type: 'object', description: 'Request headers as key-value pairs' },
        body: { type: 'string', description: 'Request body (for POST/PUT)' },
      },
      required: ['url'],
    },
  },
  async execute(args): Promise<string> {
    const url = args.url as string;
    const method = (args.method as string || 'GET').toUpperCase();
    const headers = (args.headers as Record<string, string>) || {};
    const body = args.body as string | undefined;

    const serialized = JSON.stringify({ url, headers, body });
    const hasCredentialHeader = Object.keys(headers).some((key) => /authorization|proxy-authorization|cookie|x-api-key/i.test(key));
    if (hasCredentialHeader || /\{\{vault:|password|bearer\s|access[_-]?token|refresh[_-]?token|api[_-]?key/i.test(serialized)) {
      return 'Credential access denied. Use a connector/gateway reference; agents cannot resolve Vault secrets.';
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body || undefined,
      });
      const text = await response.text();
      return `HTTP ${response.status} ${response.statusText}\n\n${text.slice(0, 4096)}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

function decodeHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Web Search Tool ---
const webSearchTool: NativeTool = {
  definition: {
    name: 'web_search',
    description: 'Search the public web. Returns titles, links, and snippets from web results. Use http_request to read a selected public page.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        max_results: { type: 'number', description: 'Maximum number of results, from 1 to 10', default: 5 },
      },
      required: ['query'],
    },
  },
  async execute(args): Promise<string> {
    const query = String(args.query || '').trim();
    if (!query) return 'A search query is required.';
    const requested = Number(args.max_results ?? 5);
    const maxResults = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 10) : 5;

    try {
      const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'V-Assistant/1.0 (+https://vuaai.net)' },
      });
      if (!response.ok) return `Web search failed (HTTP ${response.status}).`;
      const html = await response.text();
      const resultPattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      const results: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = resultPattern.exec(html)) && results.length < maxResults) {
        const url = match[1].startsWith('//') ? `https:${match[1]}` : match[1];
        results.push(`${results.length + 1}. ${decodeHtml(match[2])}\n${url}\n${decodeHtml(match[3])}`);
      }
      return results.length > 0
        ? results.join('\n\n')
        : 'No web results found. Try a more specific query.';
    } catch (error) {
      return `Web search failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

// --- Credentialed Connector Gateway Tool ---
const connectorRequestTool: NativeTool = {
  definition: {
    name: 'connector_request',
    description: 'Call the origin bound to a Vault reference. Use opaque {{credential:field}} variables; secret values are resolved and redacted by the trusted gateway.',
    input_schema: {
      type: 'object',
      properties: {
        credential_ref: { type: 'string', description: 'Opaque reference returned by vault_list' },
        url: { type: 'string', description: 'URL or path on the Vault entry origin' },
        method: { type: 'string', description: 'GET, POST, PUT, PATCH or DELETE' },
        headers: { type: 'object', description: 'Headers; credentials must use {{credential:field}} variables' },
        body: { type: 'string', description: 'Optional request body with opaque credential variables' },
      },
      required: ['credential_ref', 'url'],
    },
  },
  async execute(args): Promise<string> {
    const capability = process.env.VUA_CONNECTOR_GATEWAY_TOKEN;
    if (!capability) return 'Connector gateway is unavailable.';
    try {
      const response = await fetch(`${AI_ROUTER_URL}/v1/connectors/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${capability}` },
        body: JSON.stringify({
          credentialRef: args.credential_ref,
          url: args.url,
          method: args.method,
          headers: args.headers,
          body: args.body,
        }),
      });
      const payload = await response.json() as { status?: number; body?: string; error?: string };
      if (!response.ok) return `Connector error: ${payload.error || response.status}`;
      return `HTTP ${payload.status}\n\n${payload.body || ''}`;
    } catch (error) {
      return `Connector error: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

// --- Vault List Tool ---
const vaultListTool: NativeTool = {
  definition: {
    name: 'vault_list',
    description: 'List the names (labels) and services of all credentials stored in your secure Vault. Use this to discover which credentials are available before making API requests or using placeholders.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  async execute(): Promise<string> {
    const capability = process.env.VUA_CONNECTOR_GATEWAY_TOKEN;
    if (!capability) return 'Connector gateway is unavailable.';
    try {
      const response = await fetch(`${AI_ROUTER_URL}/v1/vault/manifest`, {
        headers: { Authorization: `Bearer ${capability}` },
      });
      if (!response.ok) return `Vault manifest is unavailable (${response.status}).`;
      const manifest = await response.json() as {
        entries?: Array<{ ref: string; label: string; service?: string; fields?: string[] }>;
      };
      const entries = manifest.entries ?? [];
      if (entries.length === 0) {
        return 'Your secure Vault is currently empty.';
      }
      return entries.map((entry) =>
        `- ${entry.label}${entry.service ? ` (${entry.service})` : ''} ref=${entry.ref}` +
        `${entry.fields?.length ? ` variables=${entry.fields.map((field) => `{{credential:${field}}}`).join(',')}` : ''}`
      ).join('\n');
    } catch (err) {
      return `Error listing Vault: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// --- Registry ---

/** All built-in native tools */
export const NATIVE_TOOLS: NativeTool[] = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  grepTool,
  globTool,
  httpRequestTool,
  webSearchTool,
  connectorRequestTool,
  vaultListTool,
];

/** Get tool definitions for all native tools (for sending to LLM) */
export function getToolDefinitions(): ToolDefinition[] {
  return NATIVE_TOOLS.map((t) => t.definition);
}

function logAudit(toolName: string, args: Record<string, unknown>, isError: boolean, errorMsg?: string): void {
  const timestamp = new Date().toISOString();
  const logDir = path.join(WORKSPACE_ROOT, '.audit');
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logLine = JSON.stringify({ timestamp, tool: toolName, args, is_error: isError, error: errorMsg }) + '\n';
    fs.appendFileSync(path.join(logDir, 'tool_calls.log'), logLine, 'utf8');
  } catch {
    /* ignore logging failure */
  }
}

/** Execute a tool by name */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = NATIVE_TOOLS.find((t) => t.definition.name === name);
  if (!tool) {
    const error = `Unknown tool: ${name}`;
    logAudit(name, args, true, error);
    return {
      tool_call_id: '',
      content: error,
      is_error: true,
    };
  }
  try {
    const result = await tool.execute(args);
    logAudit(name, args, false);
    return { tool_call_id: '', content: result };
  } catch (err) {
    const errorMsg = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
    logAudit(name, args, true, errorMsg);
    return {
      tool_call_id: '',
      content: errorMsg,
      is_error: true,
    };
  }
}
