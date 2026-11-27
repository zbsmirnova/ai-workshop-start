# Issue decision workflow

Slack is the durable source of question threads; local JSON is a cache. Ask requires an
explicit channel, recovers only bot-authored slug markers across all history pages, and
resumes after the latest bot question across all reply pages. Notifications do not advance
that boundary. Invalid/empty cache files are treated as missing. State is replaced atomically;
a separate kernel lock serializes commands sharing a cache and releases on process exit.
Concurrent independent clones are not serialized.

Wait returns the first human message after the question (ignoring bots and subtypes), unescapes
HTML entities, and caches the decision. Follow-up clears the decision; `reply.sh --notify`
preserves it. Timeout performs a final poll, then sends one nudge per thread, preserving the
answer boundary even for racing replies. Recovery restores the nudge flag from Slack.

Known temporary Slack errors (ratelimited, rate_limited, internal_error, service_unavailable,
request_timeout), network errors and HTTP 429/5xx are transient; other API/HTTP errors are fatal.
Exit codes: 0 success, 1 usage/missing configuration or cache, 2 transient failure/busy/timeout,
3 fatal error. A successful post missing its timestamp fails clearly without creating invalid
state. Restart ask before retrying an uncertain post to recover from Slack.

Tests use a fake Slack HTTP server and require Python 3 on PATH. No live Slack is used.
