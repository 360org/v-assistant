/** Built-in MCP tool registry shared by the runner and the stdio MCP server. */
import type { ToolResult } from '../providers/types.js';
import { CORE_TOOLS, type BuiltinTool } from './core.js';
export { startBuiltinMcpServer } from './server.js';
export { clearBuiltinToolContext, setBuiltinToolContext } from './context.js';

const BUILTIN_TOOLS: BuiltinTool[] = [...CORE_TOOLS];

export function getBuiltinToolDefinitions() {
  return BUILTIN_TOOLS.map((tool) => tool.definition);
}

export function hasBuiltinTool(name: string): boolean {
  return BUILTIN_TOOLS.some((tool) => tool.definition.name === name);
}

export async function executeBuiltinTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = BUILTIN_TOOLS.find((candidate) => candidate.definition.name === name);
  if (!tool) return { tool_call_id: '', content: `Unknown built-in MCP tool: ${name}`, is_error: true };
  try {
    return { tool_call_id: '', content: await tool.execute(args) };
  } catch (error) {
    return { tool_call_id: '', content: `Tool error: ${error instanceof Error ? error.message : String(error)}`, is_error: true };
  }
}
