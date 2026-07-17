/** Minimal integration check for the built-in MCP core delivery tools. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vua-builtin-mcp-'));
process.env.VUA_DATA_DIR = tempRoot;
process.env.VUA_IPC_DIR = path.join(tempRoot, 'ipc');
process.env.VUA_AGENT_WORKSPACE = path.join(tempRoot, 'workspace');

const db = await import('../src/db/index.ts');
const tools = await import('../src/mcp-tools/index.ts');

try {
  db.createInboundSchema();
  tools.setBuiltinToolContext({
    routing: { platformId: 'test-platform', channelType: 'chat', threadId: 'thread-1' },
    inReplyTo: 'inbound-1',
  });

  const definitions = tools.getBuiltinToolDefinitions();
  assert.deepEqual(definitions.map((tool) => tool.name), ['send_message', 'send_file', 'edit_message', 'add_reaction']);

  const sent = await tools.executeBuiltinTool('send_message', { text: 'hello from MCP' });
  assert.equal(sent.is_error, undefined);

  const outbound = db.getOutboundDb();
  const message = outbound.prepare('SELECT kind, platform_id, channel_type, thread_id, in_reply_to, content FROM messages_out').get();
  assert.deepEqual(message, {
    kind: 'chat',
    platform_id: 'test-platform',
    channel_type: 'chat',
    thread_id: 'thread-1',
    in_reply_to: 'inbound-1',
    content: JSON.stringify({ text: 'hello from MCP' }),
  });

  const unknown = await tools.executeBuiltinTool('does_not_exist', {});
  assert.equal(unknown.is_error, true);
  console.log('builtin MCP core delivery check passed');
} finally {
  tools.clearBuiltinToolContext();
  db.closeAll();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
