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
  assert.deepEqual(definitions.map((tool) => tool.name), ['send_message', 'send_file', 'edit_message', 'add_reaction', 'ask_user_question', 'schedule_message', 'list_scheduled', 'cancel_scheduled']);

  const sent = await tools.executeBuiltinTool('send_message', { text: 'hello from MCP' });
  assert.equal(sent.is_error, undefined);

  const question = await tools.executeBuiltinTool('ask_user_question', { question: 'Choose a database?', options: ['sqlite', 'postgres'] });
  assert.equal(question.is_error, undefined);
  assert.match(question.content, /^INTERACTIVE_QUESTION_PENDING:/);

  // --- Test Scheduling MCP Tools ---
  const sched = await tools.executeBuiltinTool('schedule_message', { name: 'Test Task', prompt: 'Echo hello', schedule: 'Every day' });
  assert.equal(sched.is_error, undefined);
  assert.match(sched.content, /Task scheduled successfully/);

  const list = await tools.executeBuiltinTool('list_scheduled', {});
  assert.equal(list.is_error, undefined);
  assert.match(list.content, /Test Task/);

  const cancel = await tools.executeBuiltinTool('cancel_scheduled', { name: 'Test Task' });
  assert.equal(cancel.is_error, undefined);
  assert.match(cancel.content, /Task canceled successfully/);

  const listAfter = await tools.executeBuiltinTool('list_scheduled', {});
  assert.match(listAfter.content, /No scheduled tasks found/);

  const outbound = db.getOutboundDb();
  const messages = outbound.prepare('SELECT kind, platform_id, channel_type, thread_id, in_reply_to, content FROM messages_out ORDER BY seq ASC').all();
  assert.equal(messages.length, 2);
  assert.deepEqual(messages[0], {
    kind: 'chat',
    platform_id: 'test-platform',
    channel_type: 'chat',
    thread_id: 'thread-1',
    in_reply_to: 'inbound-1',
    content: JSON.stringify({ text: 'hello from MCP' }),
  });

  const parsedContent = JSON.parse(messages[1].content);
  assert.equal(messages[1].kind, 'chat');
  assert.equal(parsedContent.type, 'user_question');
  assert.equal(parsedContent.question, 'Choose a database?');
  assert.deepEqual(parsedContent.options, ['sqlite', 'postgres']);
  assert.ok(parsedContent.questionId.startsWith('q-'));

  const unknown = await tools.executeBuiltinTool('does_not_exist', {});
  assert.equal(unknown.is_error, true);
  console.log('builtin MCP core delivery check passed');
} finally {
  tools.clearBuiltinToolContext();
  db.closeAll();
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
