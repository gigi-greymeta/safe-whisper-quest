# Wipe and delete audit (26 Nov 2026)

Every button and code path that deletes or wipes data, what it promises, and what it does
after the fixes in this audit. All full wipes now share `src/lib/eraseDevice.ts` (local) and
`src/lib/serverWipe.ts` (server), so they can't drift apart again.

## Where data lives

| Place | What | Cleared by a full wipe |
| --- | --- | --- |
| localStorage | ~60 `phantom_*` keys: identity, contacts, messages, groups, notes, PINs, settings, vault (`phantom_vault_*`) | Yes |
| IndexedDB `phantom_app_state_db` | Snapshot of localStorage, restored on launch | Yes (cleared, then deleted) |
| IndexedDB `phantom_identity_db` | Copy of the identity | Yes (was missed before) |
| IndexedDB `phantom_contacts_db` | Copy of the contacts | Yes (was missed before) |
| IndexedDB `phantom_outbox_db` | Messages waiting to send | Yes |
| Memory | Identity and contact caches, realtime connections | Yes (`burnAllData` first) |
| sessionStorage, cookies, Cache Storage, service workers | Session unlock, misc | Yes |
| WebView / app caches (native) | HTTP cache, web storage, cookies, Caches and tmp folders | Yes (`DeviceWipePlugin`) |
| Server: directory, inbox queues, waiting messages | Account | Panic, Panic Pin button, Burn, Reset, Delete Account (best effort except Delete Account) |
| Server: vanishing groups you run | Messages and media | History cleared; the group stays for members (removed after 48 h with no admin active) |
| Server: abuse reports | Reports you sent | Kept up to 12 months (privacy policy) |
| OS: app disguise icon, store subscription | | Kept on purpose (disguise must survive; Apple/Google own purchases) |

## Paths

| Path | Promise | Before | Now |
| --- | --- | --- | --- |
| Panic PIN (lock screen, calculator, Notes decoy, notes PIN title, unscramble, notes unlock) | Wipe all data and delete your account | Missed the identity and contact copies; group deletion removed the groups | Server account (via sealed key) and history of groups you run, then full local erase |
| Settings → Panic Pin button | Destroy keys, contacts, pairwise queues, messages, groups, vault, PINs | Phone only; server queues untouched | Same as the panic PIN |
| Settings → Burn All Data | Permanently delete all data | Phone only, and left the identity and contact copies | Server account (best effort) and full local erase; wording updated |
| Settings → Reset Wizard | Erase identity, contacts, chats, PINs, vault | Left the identity and contact copies, so the identity came back | Server account (best effort, frees your display name) and full local erase; list updated |
| Settings → Delete Account | Delete server account and everything on the phone | Left the identity and contact copies; ignored vanishing groups | Server account (required), group history, full local erase |
| Sign Out | Lock, keep the vault | Correct | Unchanged |
| Turn off panic PIN / screen lock / notes PIN | Removed | Could come back from the launch snapshot if the app closed before the next save | Saved to the vault and snapshot immediately |
| Scrambled message: 3 failed unlocks | Deleted from this device | Could come back from the vault or snapshot | Saved immediately |
| Block / Unblock | | Same risk | Saved immediately |
| Clear chat, delete contact | | Saved immediately already | Unchanged |

## Race fixed

A background save already running when a wipe began could finish afterwards and write the
identity back into the snapshot or the vault. `src/store/wipeGuard.ts` now blocks every vault and
IndexedDB write from the moment a wipe starts until the reload.

## Known limits

- Server deletion in the panic PIN, Panic Pin button, Burn and Reset needs a connection and is
  capped at 4 seconds so the phone wipe is never delayed. Offline, the account stays on the server
  (directory entry, inbox queues, waiting ciphertext for up to 7 days); it can't be retried later
  because the keys are gone. Delete Account requires the server step to succeed first.
- A panic PIN entered at the lock screen can only clear vanishing-group history if the group
  records are readable while locked.
- Ciphertext you already sent sits in other people's inboxes until delivered or for 7 days.
- Not yet run on a phone. Check after building: wipe, fully close the app, reopen; it must show
  Create Identity (or the disguise).
