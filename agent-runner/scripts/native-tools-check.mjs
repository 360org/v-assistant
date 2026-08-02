// Checks the Agent Runner's native host tools (§5.6): file_write/read/edit,
// grep, glob and bash. Deterministic, no network. Run: npx tsx scripts/native-tools-check.mjs

import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const root = mkdtempSync(path.join(tmpdir(), 'ar-tools-'));
const dir = path.join(root, 'workspace');
mkdirSync(dir);
process.env.VUA_DATA_DIR = root;
process.env.VUA_AGENT_NAME = 'default';
process.env.VUA_AGENT_WORKSPACE = dir;
const approvedDir = path.join(root, 'approved');
mkdirSync(approvedDir);
writeFileSync(path.join(approvedDir, 'readable.txt'), 'approved content');
const approvedPathsFile = path.join(root, 'approved-read-paths.json');
writeFileSync(approvedPathsFile, JSON.stringify([approvedDir]));
process.env.VUA_AGENT_APPROVED_READ_PATHS_FILE = approvedPathsFile;

// The system prompt points the agent at this tree, so the tools must reach it.
const memoryDir = path.join(root, 'agents', 'default', 'memory');
mkdirSync(memoryDir, { recursive: true });
writeFileSync(path.join(memoryDir, 'index.md'), '# what I remember');
const { executeTool, needsReadApproval } = await import('../src/native-tools/index.ts');
const file = path.join(dir, 'note.txt');

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) pass = false;
};

check('unapproved folders request permission', needsReadApproval(path.join(root, 'outside')) === path.join(root, 'outside'));
check('approved folders need no permission', needsReadApproval(approvedDir) === null);

// file_write → file_read
let r = await executeTool('file_write', { path: file, content: 'hello world\nsecond line' });
check('file_write creates a file', !r.is_error);
r = await executeTool('file_read', { path: file });
check('file_read returns the content', r.content.includes('hello world'));

// file_edit (search & replace)
r = await executeTool('file_edit', { path: file, old_text: 'hello world', new_text: 'HELLO EDITED' });
check('file_edit succeeds', !r.is_error);
r = await executeTool('file_read', { path: file });
check('file_edit changed the content', r.content.includes('HELLO EDITED') && !r.content.includes('hello world'));

// grep
r = await executeTool('grep', { pattern: 'second', path: dir });
check('grep finds a match', !r.is_error && r.content.includes('second'));

// glob
r = await executeTool('glob', { pattern: '*.txt', cwd: dir });
check('glob lists the file', r.content.includes('note.txt'));

// The search provider is intentionally not called in CI: only verify the
// tool is registered, avoiding a live-network dependency in this test.
r = await executeTool('web_search', {});
check('web_search is registered', !r.is_error && r.content.includes('search query is required'));

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(`
  <a class="result__a" href="https://example.test/first">First <b>result</b></a>
  <a class="result__snippet">A useful snippet.</a>
`);
r = await executeTool('web_search', { query: 'test query', max_results: 1 });
globalThis.fetch = originalFetch;
check('web_search parses public result pages', !r.is_error && r.content.includes('First result') && r.content.includes('https://example.test/first'));

// Host shell is deliberately not exposed to the model.
r = await executeTool('bash', { command: 'echo RUNNER_OK' });
check('bash is not exposed to the agent', r.is_error === true);

r = await executeTool('file_read', { path: path.join(root, 'vault.key') });
check('file tools cannot escape the assigned workspace', r.content.includes('Access denied'));

r = await executeTool('file_read', { path: path.join(approvedDir, 'readable.txt') });
check('file tools can read a user-approved folder', r.content.includes('approved content'));
r = await executeTool('file_write', { path: path.join(approvedDir, 'blocked.txt'), content: 'nope' });
check('approved folders remain read-only', r.content.includes('Access denied'));

r = await executeTool('file_read', { path: path.join(memoryDir, 'index.md') });
check('the agent can read its own memory', r.content.includes('what I remember'));
r = await executeTool('file_write', { path: path.join(memoryDir, 'learned.md'), content: 'a new fact' });
check('the agent can update its own memory', !r.is_error);

// unknown tool is handled, not thrown
r = await executeTool('does_not_exist', {});
check('unknown tool reported cleanly', r.is_error === true);

console.log(pass ? '\n✓ native host tools work' : '\n✗ FAILED');
process.exit(pass ? 0 : 1);
