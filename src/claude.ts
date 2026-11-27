import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { AtlasError, ModelUnavailableError } from './core/errors.ts';
import type { ModelAnswer } from './core/cluster.ts';

/** Prompt travels over stdin, never through a shell. No agent tools are enabled. */
export const claudeAnswer: ModelAnswer = (prompt) => runClaude(prompt);

export async function runClaude(prompt: string, timeoutMs = 60_000): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'atlas-model-'));
  try { return await new Promise<string>((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', 'haiku', '--output-format', 'text', '--tools', '', '--strict-mcp-config'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let outputBytes = 0;
    let failure = '';
    const timer = setTimeout(() => { failure = `Claude timed out after ${timeoutMs / 1000} seconds`; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.setEncoding('utf8').on('data', chunk => {
      output += chunk;
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > 1_000_000) { failure = 'Claude response is too large'; child.kill('SIGKILL'); }
    });
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); reject(new ModelUnavailableError(`Cannot run claude -p: ${error.message}`)); });
    child.on('close', code => {
      clearTimeout(timer);
      if (failure || code !== 0) reject(new AtlasError(failure || `claude -p failed (exit ${code}); check Claude CLI authentication`));
      else resolve(output);
    });
    child.stdin.end(prompt);
  }); } finally { await rm(cwd, { recursive: true, force: true }); }
};
