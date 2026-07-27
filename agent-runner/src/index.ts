import fs from 'fs';
import path from 'path';
import { loadConfig } from './config.js';
import { ensureIpcDir, setMaxMessagesPerPrompt } from './db/index.js';
// Import providers barrel — each adapter self-registers on import
import './providers/index.js';
import { createProvider, type ProviderName } from './providers/factory.js';
import { runPollLoop } from './poll-loop.js';
import { startScheduler } from './scheduler/index.js';
import { startTelegramChannel } from './channels/telegram.js';
import { mcpManager } from './mcp-client/index.js';
import { ensureMemoryScaffold } from './memory/memory-scaffold.js';

function log(msg: string): void {
  console.error(`[agent-runner] ${msg}`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const providerName = config.provider.toLowerCase() as ProviderName;

  log(`Starting V-Assistant Agent Runner v0.1.0`);
  log(`  Provider: ${providerName}`);
  log(`  Model: ${config.model || '(default)'}`);
  log(`  Agent: ${config.agentName}`);
  log(`  Data dir: ${config.dataDir}`);
  log(`  IPC dir: ${config.ipcDir}`);

  // Ensure IPC directory exists
  ensureIpcDir();

  // Set max messages per prompt from config
  setMaxMessagesPerPrompt(config.maxMessagesPerPrompt);

  // Initialize external MCP servers
  await mcpManager.init(config.mcpServers || {});

  // Create provider
  const provider = createProvider(providerName, {
    baseUrl: config.baseUrl,
    model: config.model,
    assistantName: config.assistantName,
    mcpServers: config.mcpServers,
  });

  // Providers opt in because some stateless/local backends may not want the
  // persistent per-agent memory tree injected into their context.
  const agentDir = path.join(config.dataDir, 'agents', config.agentName);
  if (provider.usesMemoryScaffold) {
    ensureMemoryScaffold(agentDir);
  }

  // Build system prompt after the optional scaffold exists.
  const instructions = buildSystemPrompt(config.assistantName, config.agentName, agentDir);

  log(`Provider created: ${provider.name}`);

  const loopConfig = {
    provider,
    providerName,
    agentId: config.agentName,
    agentDir,
    systemContext: { instructions },
  };

  // Scheduled tasks live here, not in the webview: closing the app window must
  // not stop a schedule (idea.md §1.3 — the brain runs in the Host Process).
  startScheduler(loopConfig);

  // Same reason for Telegram: the bot must answer with the window closed. The
  // AI Router holds the bot token; this only drives its token-free endpoints.
  startTelegramChannel(loopConfig);

  log('Entering poll loop...');

  // Enter main poll loop (runs forever)
  await runPollLoop(loopConfig);
}

/**
 * Build the system prompt from agent config.
 */
function buildSystemPrompt(assistantName: string, agentName: string, agentDir: string): string {
  const parts: string[] = [];

  parts.push(`You are ${assistantName}, a personal AI assistant.`);
  parts.push(`Current role: ${agentName}`);
  parts.push('');
  parts.push('You have access to the following tools to help the user:');
  parts.push('- file_read: Read files');
  parts.push('- file_write: Write/create files');
  parts.push('- file_edit: Search and replace in files');
  parts.push('- grep: Search file contents');
  parts.push('- glob: List files by pattern');
  parts.push('- http_request: Make unauthenticated HTTP requests');
  parts.push('- web_search: Search the public web, then use http_request to read a result');
  parts.push('- connector_request: Use an opaque connector reference through the trusted gateway');
  parts.push('- schedule_task: Create and add a scheduled task into V-Assistant "Lịch & Nhiệm vụ" (Scheduled Tasks)');
  parts.push('');
  parts.push('=== MANDATORY SCHEDULING RULE ===');
  parts.push('When the user asks to schedule a task, post, report, or reminder (e.g., "đặt lịch đăng bài", "lên lịch chạy tự động", "nhắc nhở"), ALWAYS use the "schedule_task" tool to add it directly to V-Assistant "Lịch & Nhiệm vụ". DO NOT attempt to schedule it on external target websites unless explicitly asked.');
  parts.push('');
  parts.push('=== MANDATORY WORKSPACE & FILE STORAGE RULE ===');
  parts.push('- All created or generated files MUST be saved inside your active workspace directory.');
  parts.push('- NEVER write or save files to Desktop (/Users/*/Desktop), Downloads, /tmp or outside the workspace unless the user explicitly specified that exact full absolute path in their current message.');
  parts.push('- Always use tools when they would help accomplish the task.');
  parts.push('Be concise and helpful.');

  // Load Instructions
  const instPath = path.join(agentDir, 'instructions.md');
  if (fs.existsSync(instPath)) {
    const content = fs.readFileSync(instPath, 'utf8').trim();
    if (content) {
      parts.push('\n=== Custom Agent Instructions ===');
      parts.push(content);
    }
  }

  // Load Soul
  const soulPath = path.join(agentDir, 'soul.md');
  if (fs.existsSync(soulPath)) {
    const content = fs.readFileSync(soulPath, 'utf8').trim();
    if (content) {
      parts.push('\n=== Custom Agent Soul & Personality ===');
      parts.push(content);
    }
  }

  // Load Memory system guidelines
  const memoryDir = path.join(agentDir, 'memory');
  if (fs.existsSync(memoryDir)) {
    parts.push('\n=== Persistent Memory ===');
    parts.push(`Your persistent memory is stored in: ${memoryDir}`);
    parts.push('You can read and update files in this directory to persist facts, project context, preferences, and learnings across turns.');
    parts.push('Refer to memory/system/definition.md and memory/index.md for memory structure and guidelines.');
  }

  return parts.join('\n');
}

// --- Process lifecycle ---

// Graceful shutdown
process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down...');
  mcpManager.shutdown();
  process.exit(0);
});

process.on('SIGINT', () => {
  log('Received SIGINT, shutting down...');
  mcpManager.shutdown();
  process.exit(0);
});

// Start
main().catch((err) => {
  log(`Fatal error: ${err instanceof Error ? err.message : String(err)}`);
  mcpManager.shutdown();
  process.exit(1);
});
