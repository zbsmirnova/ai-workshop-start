import { replay, type Recording } from '../../src/core/replay.ts';
import { snapshots } from './real-repositories.ts';

const recording: Recording = {};
for (const [repo, { branch, commit, skills, otherFiles }] of Object.entries(snapshots)) {
  const api = `https://api.github.com/repos/${repo}`;
  recording[api] = { status: 200, body: { full_name: repo, default_branch: branch } };
  recording[`${api}/commits/${branch}`] = { status: 200, body: { sha: commit } };
  recording[`${api}/git/trees/${commit}?recursive=1`] = {
    status: 200,
    body: {
      truncated: false,
      tree: [...Object.keys(skills), ...otherFiles].map((path) => ({ path, mode: '100644', type: 'blob' })),
    },
  };
  for (const [path, body] of Object.entries(skills)) {
    recording[`https://raw.githubusercontent.com/${repo}/${commit}/${path}`] = { status: 200, body };
  }
}

// Installed only in the spawned CLI; unexpected requests fail instead of using the network.
const fetchRecorded = replay(recording);
globalThis.fetch = (input) => fetchRecorded(String(input));