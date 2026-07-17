/** Core delivery tools backed by the runner-owned outbound IPC database. */
import fs from 'fs';
import path from 'path';
import { getMessageIdBySeq, getRoutingBySeq, writeMessageOut } from '../db/index.js';
import { findByName, getAllDestinations } from '../destinations.js';
import type { ToolDefinition } from '../providers/types.js';
import { getBuiltinToolContext } from './context.js';

const WORKSPACE_ROOT = path.resolve(
  process.env.VUA_AGENT_WORKSPACE || path.join(process.env.VUA_DATA_DIR || '/tmp/v-assistant', 'workspace'),
);
const OUTBOX_ROOT = path.resolve(process.env.VUA_DATA_DIR || '/tmp/v-assistant', 'outbox');

export interface BuiltinTool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<string>;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function workspaceFile(input: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, input);
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(`${WORKSPACE_ROOT}${path.sep}`)) {
    throw new Error('Access denied: files must remain inside the assigned workspace.');
  }
  return resolved;
}

function routingFor(args: Record<string, unknown>) {
  const current = getBuiltinToolContext();
  const destinationName = typeof args.to === 'string' ? args.to : undefined;
  if (destinationName) {
    const destination = findByName(destinationName);
    if (!destination) throw new Error(`Unknown destination "${destinationName}".`);
    if (destination.type === 'agent') {
      return {
        platform_id: destination.agentGroupId || destination.platformId || null,
        channel_type: 'agent',
        thread_id: null,
        in_reply_to: current.inReplyTo,
      };
    }
    return {
      platform_id: destination.platformId || null,
      channel_type: destination.channelType || null,
      thread_id: destination.platformId === current.routing.platformId && destination.channelType === current.routing.channelType
        ? current.routing.threadId
        : null,
      in_reply_to: current.inReplyTo,
    };
  }
  const available = getAllDestinations();
  if (!current.routing.platformId && available.length > 1) {
    throw new Error(`Multiple destinations are available. Choose one with "to": ${available.map((entry) => entry.name).join(', ')}.`);
  }
  return {
    platform_id: typeof args.platform_id === 'string' ? args.platform_id : current.routing.platformId,
    channel_type: typeof args.channel_type === 'string' ? args.channel_type : current.routing.channelType,
    thread_id: typeof args.thread_id === 'string' ? args.thread_id : current.routing.threadId,
    in_reply_to: current.inReplyTo,
  };
}

const sendMessage: BuiltinTool = {
  definition: {
    name: 'send_message',
    description: 'Send a chat message to the current conversation, or to an explicitly provided routing destination.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Message text' },
        to: { type: 'string', description: 'Named host-approved destination. Optional for the current conversation.' },
        platform_id: { type: 'string' },
        channel_type: { type: 'string' },
        thread_id: { type: 'string' },
      },
      required: ['text'],
    },
  },
  async execute(args): Promise<string> {
    const text = String(args.text || '').trim();
    if (!text) throw new Error('text is required');
    const routing = routingFor(args);
    const seq = writeMessageOut({
      id: newId('out'),
      ...routing,
      kind: 'chat',
      content: JSON.stringify({ text }),
    });
    return `Message queued (seq ${seq}).`;
  },
};

const sendFile: BuiltinTool = {
  definition: {
    name: 'send_file',
    description: 'Send a workspace file to the current conversation. Files outside the assigned workspace are never accessible.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the assigned workspace' },
        to: { type: 'string', description: 'Named host-approved destination. Optional for the current conversation.' },
        caption: { type: 'string', description: 'Optional file caption' },
      },
      required: ['path'],
    },
  },
  async execute(args): Promise<string> {
    const source = workspaceFile(String(args.path || ''));
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error('Workspace file was not found.');
    fs.mkdirSync(OUTBOX_ROOT, { recursive: true });
    const destination = path.join(OUTBOX_ROOT, `${newId('file')}-${path.basename(source)}`);
    fs.copyFileSync(source, destination);
    const routing = routingFor(args);
    const seq = writeMessageOut({
      id: newId('out'),
      ...routing,
      kind: 'file',
      content: JSON.stringify({ filePath: destination, fileName: path.basename(source), caption: String(args.caption || '') }),
    });
    return `File queued (seq ${seq}).`;
  },
};

function messageRouting(seq: number) {
  const routing = getRoutingBySeq(seq);
  if (!routing) throw new Error(`No outbound message exists for seq ${seq}.`);
  const messageId = getMessageIdBySeq(seq);
  if (!messageId) throw new Error(`No message exists for seq ${seq}.`);
  return { routing, messageId };
}

const editMessage: BuiltinTool = {
  definition: {
    name: 'edit_message',
    description: 'Request an edit to an outbound message previously sent by this runner.',
    input_schema: {
      type: 'object',
      properties: { message_seq: { type: 'number' }, text: { type: 'string' } },
      required: ['message_seq', 'text'],
    },
  },
  async execute(args): Promise<string> {
    const seqToEdit = Number(args.message_seq);
    const { routing, messageId } = messageRouting(seqToEdit);
    const seq = writeMessageOut({
      id: newId('out'), kind: 'edit', ...routing,
      content: JSON.stringify({ messageId, text: String(args.text || '') }),
    });
    return `Edit queued (seq ${seq}).`;
  },
};

const addReaction: BuiltinTool = {
  definition: {
    name: 'add_reaction',
    description: 'Add an emoji reaction to a previously sent or received message by sequence number.',
    input_schema: {
      type: 'object',
      properties: { message_seq: { type: 'number' }, emoji: { type: 'string' } },
      required: ['message_seq', 'emoji'],
    },
  },
  async execute(args): Promise<string> {
    const targetSeq = Number(args.message_seq);
    const { routing, messageId } = messageRouting(targetSeq);
    const seq = writeMessageOut({
      id: newId('out'), kind: 'reaction', ...routing,
      content: JSON.stringify({ messageId, emoji: String(args.emoji || '') }),
    });
    return `Reaction queued (seq ${seq}).`;
  },
};

export const CORE_TOOLS: BuiltinTool[] = [sendMessage, sendFile, editMessage, addReaction];
