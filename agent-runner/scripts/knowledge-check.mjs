// Checks knowledge retrieval in the Host Process: the runner reads the chunks
// the app wrote, scores them against the question, keeps roles isolated, and
// stays quiet when there is nothing to ground on. Deterministic, no network.
// Run: npx tsx scripts/knowledge-check.mjs

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const root = mkdtempSync(path.join(tmpdir(), 'ar-know-'));
const ipcDir = path.join(root, 'ipc');
mkdirSync(ipcDir, { recursive: true });
process.env.VUA_DATA_DIR = root;
process.env.VUA_IPC_DIR = ipcDir;

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) pass = false;
};

const { retrieveKnowledge, formatExcerpts, bucketFor, closeKnowledge } =
  await import('../src/knowledge/index.ts');

// --- an empty store must not break a turn ------------------------------------
check('no store yet means no excerpts, not a crash', retrieveKnowledge('general', 'bất cứ điều gì').length === 0);
closeKnowledge();

// --- the app's side of the contract, written exactly as src-tauri does -------
const db = new DatabaseSync(path.join(ipcDir, 'knowledge.db'));
db.exec(`
  CREATE TABLE knowledge_files (
    file_id TEXT PRIMARY KEY, bucket TEXT NOT NULL, name TEXT NOT NULL,
    data_url TEXT, added_at INTEGER NOT NULL);
  CREATE TABLE knowledge_chunks (
    file_id TEXT NOT NULL, bucket TEXT NOT NULL, idx INTEGER NOT NULL,
    text TEXT NOT NULL, PRIMARY KEY (file_id, idx));
`);

const addFile = (fileId, bucket, name, chunks) => {
  db.prepare('INSERT INTO knowledge_files (file_id, bucket, name, data_url, added_at) VALUES (?,?,?,NULL,?)')
    .run(fileId, bucket, name, Date.now());
  chunks.forEach((text, idx) =>
    db.prepare('INSERT INTO knowledge_chunks (file_id, bucket, idx, text) VALUES (?,?,?,?)')
      .run(fileId, bucket, idx, text),
  );
};

addFile('f1', 'general', 'chinh-sach-bao-hanh.md', [
  'Chính sách bảo hành: mọi thiết bị được bảo hành 24 tháng kể từ ngày mua.',
  'Thủ tục đổi trả trong vòng 7 ngày nếu sản phẩm còn nguyên tem.',
]);
addFile('f2', 'general', 'bang-gia.md', ['Bảng giá gói Pro là 4.900.000 đồng mỗi năm.']);
addFile('f3', 'sales-role', 'kich-ban-sales.md', ['Kịch bản gọi điện cho khách hàng tiềm năng.']);

// --- retrieval ---------------------------------------------------------------
let excerpts = retrieveKnowledge(null, 'bảo hành bao lâu?');
check('the matching document is retrieved', excerpts.length > 0);
check('the excerpt names its source', excerpts[0].name === 'chinh-sach-bao-hanh.md');
check('the excerpt carries the answer', excerpts[0].text.includes('24 tháng'));

excerpts = retrieveKnowledge(null, 'bảng giá gói Pro');
check('a different question retrieves a different document', excerpts[0].name === 'bang-gia.md');

// --- role isolation ----------------------------------------------------------
check('a role never sees another role\'s documents', retrieveKnowledge('sales-role', 'bảo hành bao lâu?').length === 0);
check('a role does see its own', retrieveKnowledge('sales-role', 'kịch bản gọi điện').length === 1);
check('no role means the general bucket', bucketFor(null) === 'general' && bucketFor('default') === 'general');

// --- nothing to ground on ----------------------------------------------------
check('an unrelated question retrieves nothing', retrieveKnowledge(null, 'zzz qqq').length === 0);
check('a question with no usable terms retrieves nothing', retrieveKnowledge(null, '?!').length === 0);

// --- the prompt section ------------------------------------------------------
const section = formatExcerpts(retrieveKnowledge(null, 'bảo hành'));
check('the grounding section quotes the excerpt', section.includes('24 tháng'));
check('the grounding section cites the document', section.includes('chinh-sach-bao-hanh.md'));
check('no excerpts means no section at all', formatExcerpts([]) === '');

// --- the cap -----------------------------------------------------------------
addFile('f4', 'capped', 'long.md', Array.from({ length: 20 }, () => 'bảo hành '.repeat(400)));
const capped = retrieveKnowledge('capped', 'bảo hành');
check('excerpts are capped so they cannot flood the prompt', capped.reduce((n, e) => n + e.text.length, 0) <= 6000);

closeKnowledge();
db.close();
console.log(pass ? '\n✓ Host Process knowledge retrieval works' : '\n✗ FAILED');
process.exit(pass ? 0 : 1);
