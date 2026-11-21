---
name: Security Hardening v2
description: RLS filtering, rate limiting, secure erase, padding, epoch storage, sentry mode, CSP, deterministic queues
type: feature
---

## Implemented
- **Server-side realtime filtering**: per-queue Supabase channels with `filter: queue_id=eq.X`
- **PIN brute-force rate limiting**: exponential lockout after 5 failed attempts
- **Secure erase**: vault/lock data overwritten before deletion
- **Sentry Mode (panic credential)**: silently wipes all data + reloads to fresh-install state on entry of decoy PIN/passphrase. App.handlePanicWipe paints blank screen, runs secureEraseAll + clipboard/storage clear, then `location.replace`
- **Message padding**: bucket sizes 1KB/4KB/16KB/64KB
- **Argon2id (hash-wasm)**: replaces PBKDF2 for PIN/passphrase; PBKDF2 fallback via `phantom_kdf_version`
- **Non-extractable ephemeral ratchet keys**: XSS cannot exfiltrate
- **Forward-secure local storage (epoch keys)**: 24h rotating AES-256-GCM keys, 7-day retention
- **Strict CSP via meta tag** in `index.html`: `default-src 'self'`, no inline scripts, only Supabase REST/Realtime in `connect-src`, `'wasm-unsafe-eval'` for Argon2, `frame-ancestors 'none'`, `form-action 'none'`
- **Deterministic pairwise queue IDs** (`src/crypto/deriveQueue.ts`): inbox = `SHA-256(sortedPair(self,peer) + ":phantom-pair-v1:inbox:" + owner).slice(0,32)`. Both peers compute identical IDs ⇒ no race condition. `createQueue` accepts explicit ID and is idempotent (swallows 23505)

## Architectural decisions
- RLS stays permissive (zero-account by design)
- `saveMessage` is async — all callers awaited
- Once epoch key is purged, message shows `[Message expired]`
- `discoverOutboxQueue` retained as backfill helper for legacy contacts only — derives, no longer queries server
