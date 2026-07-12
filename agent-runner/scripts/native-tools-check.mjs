// Checks the Agent Runner's native host tools (§5.6): file_write/read/edit,
// grep, glob and bash. Deterministic, no network. Run: npx tsx scripts/native-tools-check.mjs

import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const { executeTool } = await import('../src/native-tools/index.ts');

const dir = mkdtempSync(path.join(tmpdir(), 'ar-tools-'));
const file = path.join(dir, 'note.txt');

let pass = true;
const check = (name, cond) => {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond) pass = false;
};

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

// bash
r = await executeTool('bash', { command: 'echo RUNNER_OK' });
check('bash executes a command', r.content.includes('RUNNER_OK'));

// unknown tool is handled, not thrown
r = await executeTool('does_not_exist', {});
check('unknown tool reported cleanly', r.is_error === true);

console.log(pass ? '\n✓ native host tools work' : '\n✗ FAILED');
process.exit(pass ? 0 : 1);
