import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpManager } from '../src/mcp-client/index.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const manager = new McpManager();

try {
  await manager.init({
    test: {
      command: process.execPath,
      args: [path.join(here, 'mock-mcp-server.mjs')],
      env: {},
    },
  });

  const tools = await manager.listAllTools();
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'test__echo');

  const result = await manager.executeTool('test__echo', { value: 'MCP_OK' });
  assert.equal(result?.content, 'MCP_OK');
  assert.equal(result?.is_error, false);
  console.log('✓ MCP initialize handshake, tool discovery, and tool call work');
} finally {
  manager.shutdown();
}
