import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { AtlasError } from './core/errors.ts';
import type { ModelAnswer } from './core/cluster.ts';

/** Prompt travels over stdin, never through a shell. No agent tools are enabled. */
export const claudeAnswer: ModelAnswer = async (prompt) => {
  const cwd = await mkdtemp(join(tmpdir(), 'atlas-model-'));
  try { return await new Promise<string>((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', 'haiku', '--output-format', 'text', '--tools', '', '--strict-mcp-config'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let outputBytes = 0;
    let failure = '';
    const timer = setTimeout(() => { failure = 'Claude timed out after 60 seconds'; child.kill('SIGKILL'); }, 60_000);
    child.stdout.setEncoding('utf8').on('data', chunk => {
      output += chunk;
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > 1_000_000) { failure = 'Claude response is too large'; child.kill('SIGKILL'); }
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); reject(new AtlasError(`Cannot run claude -p: ${error.message}`)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure || code !== 0) reject(new AtlasError(failure || `claude -p failed (exit ${code}); check Claude CLI authentication`));
      else resolve(output);
    });
    child.stdin.end(prompt);
  }); } finally { await rm(cwd, { recursive: true, force: true }); }
};
