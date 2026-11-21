

# Encrypted Messaging App — Build Plan

## Overview
Build a full-featured encrypted messaging app UI with client-side E2E encryption, inspired by Signal and SimpleX. No backend for now — encryption and chat logic run entirely in the browser using the Web Crypto API and local storage.

## Security Features (Signal/SimpleX-inspired)
- **E2E Encryption**: AES-256-GCM for messages, X25519 (ECDH) key exchange per conversation
- **Forward Secrecy**: New ephemeral keys per session (Double Ratchet simplified)
- **No Persistent Identifiers**: Username-based (no phone/email required), like SimpleX
- **Disappearing Messages**: Configurable auto-delete timer
- **Local-Only Storage**: All keys and messages stored in browser only (localStorage/IndexedDB)
- **No Tracking**: Zero analytics, no third-party scripts

## Pages & Components

### 1. Onboarding / Key Generation (`/`)
- Generate a new identity (display name + keypair)
- Show public key as a shareable QR code or connection string
- No account creation — purely local identity

### 2. Contacts (`/contacts`)
- Add contacts by pasting their public key or scanning QR code
- Each contact creates a unique pairwise encryption channel
- Show contact list with online indicators (simulated for now)

### 3. Chat View (`/chat/:contactId`)
- Real-time-style message thread (local simulation)
- Messages encrypted before storage, decrypted on render
- Disappearing messages toggle with timer options (30s, 5m, 1h, 24h)
- Message status indicators (sent, delivered, read — simulated)
- Sealed sender concept shown in UI

### 4. Settings (`/settings`)
- View/export your identity keys
- Toggle disappearing messages default
- "Burn all data" button — wipes all local storage
- Security info panel explaining the encryption used

## Technical Approach

| Layer | Technology |
|-------|-----------|
| Encryption | Web Crypto API (ECDH P-256, AES-256-GCM) |
| Key Storage | IndexedDB via `idb` or localStorage |
| State Management | React Context + useReducer |
| Routing | React Router (already set up) |
| UI | Tailwind + shadcn/ui components |
| QR Codes | `qrcode.react` library |

## File Structure
```text
src/
├── crypto/
│   ├── keys.ts          — Key generation, ECDH, import/export
│   ├── encrypt.ts       — AES-256-GCM encrypt/decrypt
│   └── ratchet.ts       — Simplified Double Ratchet
├── store/
│   ├── identity.ts      — Local identity management
│   ├── contacts.ts      — Contact list (pairwise keys)
│   └── messages.ts      — Encrypted message storage
├── contexts/
│   └── CryptoContext.tsx — Provides crypto state app-wide
├── pages/
│   ├── Index.tsx         — Onboarding / key generation
│   ├── Contacts.tsx      — Contact list
│   ├── Chat.tsx          — Encrypted chat view
│   └── Settings.tsx      — Identity & security settings
├── components/
│   ├── MessageBubble.tsx
│   ├── ChatInput.tsx
│   ├── ContactCard.tsx
│   ├── QRCode.tsx
│   ├── KeyDisplay.tsx
│   └── DisappearingTimer.tsx
```

## Build Order
1. Crypto layer (key generation, encrypt/decrypt, key exchange)
2. Identity store and onboarding page
3. Contacts page with key exchange flow
4. Chat page with encrypted message send/receive (local)
5. Disappearing messages and settings page
6. Dark theme and mobile-responsive polish

## What This Won't Do Yet (Future Backend Phase)
- Real-time message delivery between devices
- Push notifications
- Multi-device sync
- Relay server routing (SimpleX-style)

