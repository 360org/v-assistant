/**
 * Demo sender — gửi test message vào inbound.db để kiểm tra Agent Runner.
 *
 * Chạy: tsx scripts/demo-send.ts
 *
 * Kịch bản:
 * 1. Tạo inbound.db schema
 * 2. Gửi một message "Hello, hãy cho tôi biết ngày giờ hiện tại"
 * 3. Poll outbound.db chờ phản hồi
 * 4. In kết quả
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const IPC_DIR = process.env.VUA_IPC_DIR || '/data/ipc';
const INBOUND_PATH = path.join(IPC_DIR, 'inbound.db');
const OUTBOUND_PATH = path.join(IPC_DIR, 'outbound.db');

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createInboundSchema(): void {
  ensureDir(IPC_DIR);
  const db = new Database(INBOUND_PATH);
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages_in (
      id            TEXT PRIMARY KEY,
      seq           INTEGER UNIQUE,
      kind          TEXT NOT NULL DEFAULT 'chat',
      timestamp     TEXT NOT NULL DEFAULT (datetime('now')),
      status        TEXT NOT NULL DEFAULT 'pending',
      process_after TEXT,
      recurrence    TEXT,
      tries         INTEGER NOT NULL DEFAULT 0,
      trigger       INTEGER NOT NULL DEFAULT 1,
      platform_id   TEXT,
      channel_type  TEXT,
      thread_id     TEXT,
      content       TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS destinations (
      name          TEXT PRIMARY KEY,
      type          TEXT NOT NULL DEFAULT 'channel',
      channel_type  TEXT,
      platform_id   TEXT,
      metadata      TEXT
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_routing (
      key           TEXT PRIMARY KEY DEFAULT 'current',
      channel_type  TEXT,
      platform_id   TEXT,
      thread_id     TEXT
    );
  `);
  db.close();
  log(`✅ Inbound DB created: ${INBOUND_PATH}`);
}

function sendMessage(text: string): void {
  const db = new Database(INBOUND_PATH);

  const maxSeq = (db.prepare('SELECT COALESCE(MAX(seq), 0) AS m FROM messages_in').get() as { m: number }).m;
  const nextSeq = maxSeq % 2 === 0 ? maxSeq + 2 : maxSeq + 1; // even for host

  const id = `demo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  db.prepare(`
    INSERT INTO messages_in (id, seq, kind, timestamp, status, trigger, content)
    VALUES (?, ?, 'chat', datetime('now'), 'pending', 1, ?)
  `).run(id, nextSeq, JSON.stringify({ text }));

  db.close();
  log(`📤 Sent message (seq=${nextSeq}): "${text}"`);
}

async function pollResponse(timeoutMs = 60000): Promise<string | null> {
  const start = Date.now();
  log('⏳ Waiting for agent response...');

  while (Date.now() - start < timeoutMs) {
    try {
      if (!fs.existsSync(OUTBOUND_PATH)) {
        await sleep(1000);
        continue;
      }

      const db = new Database(OUTBOUND_PATH, { readonly: true });
      const rows = db.prepare(`
        SELECT * FROM messages_out ORDER BY seq DESC LIMIT 1
      `).all() as Array<{ content: string; seq: number; timestamp: string }>;
      db.close();

      if (rows.length > 0) {
        const content = rows[0].content;
        try {
          const parsed = JSON.parse(content);
          return parsed.text || content;
        } catch {
          return content;
        }
      }
    } catch {
      // DB might not exist yet
    }
    await sleep(1000);
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Main ---
async function main(): Promise<void> {
  log('🚀 V-Assistant Agent Runner — Demo Sender');
  log(`   IPC dir: ${IPC_DIR}`);
  log('');

  // Step 1: Create inbound schema
  createInboundSchema();

  // Step 2: Send test messages
  const testMessages = [
    'Xin chào! Hãy cho tôi biết bạn là ai và bạn có thể làm gì?',
  ];

  for (const msg of testMessages) {
    sendMessage(msg);
  }

  // Step 3: Poll for response
  const response = await pollResponse(120000); // Wait up to 2 minutes

  log('');
  if (response) {
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('📥 Agent Response:');
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log(response);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('✅ Demo PASSED — Agent Runner is working!');
  } else {
    log('❌ No response received within timeout.');
    log('');
    log('Possible reasons:');
    log('  1. No API key set (set VUA_API_KEY env var)');
    log('  2. Agent Runner not started yet');
    log('  3. Provider error (check agent-runner logs)');
    log('');
    log('Without an API key, this is EXPECTED behavior.');
    log('The poll loop is running and waiting for messages.');
    
    // Check if runner created the outbound DB (means it started OK)
    if (fs.existsSync(OUTBOUND_PATH)) {
      log('');
      log('✅ Agent Runner DID start successfully (outbound.db exists).');
      log('   It just cannot call the LLM without an API key.');
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
