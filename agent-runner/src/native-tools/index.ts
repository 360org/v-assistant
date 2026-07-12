/**
 * Native tool definitions and executor.
 *
 * Tools run directly on the host OS (no Docker container).
 * Each tool implements: name, description, input_schema, execute().
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { ToolDefinition, ToolResult } from '../providers/types.js';

function log(msg: string): void {
  console.error(`[native-tools] ${msg}`);
}

/** A native tool with its definition and executor */
export interface NativeTool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<string>;
}

// --- Bash Tool ---
const bashTool: NativeTool = {
  definition: {
    name: 'bash',
    description: 'Execute a shell command on the host OS. Use for running scripts, installing packages, checking status, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['command'],
    },
  },
  async execute(args): Promise<string> {
    const command = args.command as string;
    const timeout = (args.timeout_ms as number) || 30000;
    log(`Executing: ${command}`);
    try {
      const output = execSync(command, {
        timeout,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024, // 1MB
        shell: '/bin/sh',
      });
      return output || '(no output)';
    } catch (err: unknown) {
      const e = err as { status?: number; stderr?: string; stdout?: string; message?: string };
      return `Exit code: ${e.status || 1}\nstderr: ${e.stderr || ''}\nstdout: ${e.stdout || ''}\n${e.message || ''}`.trim();
    }
  },
};

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
    const filePath = args.path as string;
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
    const filePath = args.path as string;
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
    const filePath = args.path as string;
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
    const searchPath = args.path as string;
    const include = args.include as string | undefined;
    const caseInsensitive = args.case_insensitive as boolean | undefined;

    const grepArgs = ['-rnI', '--color=never'];
    if (caseInsensitive) grepArgs.push('-i');
    if (include) grepArgs.push(`--include=${include}`);
    grepArgs.push(pattern, searchPath);

    try {
      const output = execSync(`grep ${grepArgs.join(' ')}`, {
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
    const cwd = (args.cwd as string) || process.cwd();

    try {
      // Use find command as a portable alternative
      const cmd = `find ${cwd} -path '${pattern}' -type f 2>/dev/null | head -100`;
      const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 256 * 1024, timeout: 10000 });
      return output || '(no matches)';
    } catch {
      return '(no matches)';
    }
  },
};

import { resolveVaultPlaceholders, getVaultSecret } from '../vault/vault-resolver.js';

// --- HTTP Request Tool ---
const httpRequestTool: NativeTool = {
  definition: {
    name: 'http_request',
    description: 'Make an HTTP request. Supports GET, POST, PUT, DELETE. Vault placeholders {{vault:Name.field}} are resolved before sending.',
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

    // Resolve vault placeholders in url, headers, and body
    const resolvedUrl = resolveVaultPlaceholders(url);
    const resolvedBody = body ? resolveVaultPlaceholders(body) : undefined;
    const resolvedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      resolvedHeaders[k] = resolveVaultPlaceholders(v);
    }

    try {
      const response = await fetch(resolvedUrl, {
        method,
        headers: resolvedHeaders,
        body: resolvedBody || undefined,
      });
      const text = await response.text();
      return `HTTP ${response.status} ${response.statusText}\n\n${text.slice(0, 4096)}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
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
    try {
      const indexRaw = getVaultSecret('vault-index');
      if (!indexRaw) {
        return 'Your secure Vault is currently empty.';
      }
      const index = JSON.parse(indexRaw) as Array<{ label: string; service?: string }>;
      if (index.length === 0) {
        return 'Your secure Vault is currently empty.';
      }
      return index.map((e) => `- ${e.label}${e.service ? ` (Service: ${e.service})` : ''}`).join('\n');
    } catch (err) {
      return `Error listing Vault: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

// --- Registry ---

/** All built-in native tools */
export const NATIVE_TOOLS: NativeTool[] = [
  bashTool,
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  grepTool,
  globTool,
  httpRequestTool,
  vaultListTool,
];

/** Get tool definitions for all native tools (for sending to LLM) */
export function getToolDefinitions(): ToolDefinition[] {
  return NATIVE_TOOLS.map((t) => t.definition);
}

/** Execute a tool by name */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = NATIVE_TOOLS.find((t) => t.definition.name === name);
  if (!tool) {
    return {
      tool_call_id: '',
      content: `Unknown tool: ${name}`,
      is_error: true,
    };
  }
  try {
    const result = await tool.execute(args);
    return { tool_call_id: '', content: result };
  } catch (err) {
    return {
      tool_call_id: '',
      content: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
      is_error: true,
    };
  }
}
