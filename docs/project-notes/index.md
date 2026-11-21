# Project Memory

## Core
Phantom — E2E encrypted messaging app. Dark theme. Zero-knowledge, no accounts.
ECDH P-256, AES-256-GCM, HMAC-SHA256, Double Ratchet forward secrecy.
All data localStorage-only. Supabase relay for message passing (no auth, anonymous RLS).
User wants a custom domain linked to Phantom.
No Google auth/login — user wants to avoid Google entirely. Do not add Google OAuth.

## Memories
- [Security features](mem://features/security) — Full list of implemented security hardening features
- [Crypto stack](mem://features/crypto) — Encryption protocols and transparency features
- [Pending](mem://features/pending) — Features still to explore
- [Security hardening v2](mem://features/security-v2) — Server-side filtering, rate limiting, secure erase, padding
