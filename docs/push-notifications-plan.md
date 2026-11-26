# Push notifications plan

Goal: tell people about new messages, message requests, group invites and calls while
Phantom is closed, without giving Apple, Google or our server anything private.

## Principles

1. **Content-free pushes.** A push never carries message text, a sender's name or a group
   name. It says only "something arrived"; the phone shows a generic alert (or wakes the app
   to fetch). Apple and Google see a token and a timestamp, nothing else.
2. **Built on the existing doorbell.** Every relay v2 inbox already has a doorbell topic (an
   HMAC only the owner can compute) that a database trigger rings on each new envelope. Push
   is a second way of ringing it, so no new metadata is created about who talks to whom.
3. **Respects disguise and panic.** A disguised app never shows "Phantom" or anything
   message-like in a notification. A panic wipe, reset or account deletion removes every push
   registration first.
4. **Off until asked.** The permission prompt appears only when the person turns
   notifications on, with an explanation first.

## How it works

```
sender ──relay_send──▶ relay_messages ──trigger──▶ doorbell (Realtime, app open)
                                         └────────▶ push_queue ──▶ send-push (Edge Function)
                                                                    ├─▶ FCM  (Android)
                                                                    └─▶ APNs (iPhone)
```

- **Registration.** When notifications are on, the phone gets a push token from
  `@capacitor/push-notifications` and registers it against each of its inbox topics
  (pairwise inboxes, the request inbox, vanishing-group addresses) through a new RPC that
  requires the inbox's read token. So only the inbox owner can attach a phone to it.
- **Storage.** New table `push_subscriptions(topic, token_ciphertext, platform, created_at)`,
  RLS on, no policies. The token is encrypted with a server-side key held only by the
  Edge Function (Supabase secret), so a database dump alone doesn't reveal tokens.
- **Sending.** The existing doorbell trigger also inserts `(topic)` into `push_queue`.
  A Database Webhook (or `pg_net`) calls the `send-push` Edge Function, which collapses
  bursts (at most one push per device per 30 seconds, using a collapse key) and sends:
  - **Android (FCM):** high-priority *data* message; the app shows a local notification.
  - **iPhone (APNs):** an alert with generic text, `mutable-content` off, a thread id per
    device, not per chat.
- **What the person sees** (setting, default "New message"):
  - *Nothing visible*: badge only.
  - *"New message"*: one generic line. With a disguise on, the disguise's text instead
    ("Calculator: Reminder", "Notes: New note", "Weather: Update").
  - Sender names in notifications are **not** offered in phase 1: they'd need the keys outside
    the app's web view (a Notification Service Extension on iOS), which weakens the vault.
- **Vanishing groups** don't use relay inboxes, so they get the same pattern: a doorbell topic
  per group address, rung by a trigger on `vanishing_group_messages`.
- **Unregistering.** Turning notifications off, removing a contact, leaving a group, and
  every wipe path (`eraseAllLocalData` and `wipeServerData`) delete the phone's
  subscriptions first. `delete-identity` also deletes them server-side.

## Calls (separate phase)

Ringing a closed app is a different mechanism on each platform:
- **iPhone:** a VoIP push through PushKit, and the app must immediately report the call to
  CallKit (Apple terminates apps that don't). The native ringing screen shows a caller name we
  set; with privacy on, it shows "Phantom call" or the disguise name.
- **Android:** a high-priority FCM data message, then a full-screen incoming-call
  notification (`ConnectionService` / `CallStyle`), with permission for full-screen intents
  on Android 14+.
This needs native plugin work and plenty of device testing, so it comes after messages.

## Phases

| Phase | Scope | Rough effort |
| --- | --- | --- |
| 1 | Messages and message requests, Android and iPhone, generic text, settings switch, wipe cleanup | 3–4 days |
| 2 | Vanishing groups, disguise-aware text, per-chat mute, quiet hours | 2 days |
| 3 | Incoming calls: CallKit and PushKit (iPhone), ConnectionService (Android) | 1–2 weeks |

## What you need to provide

- **Firebase project** for Android: add the Android app `au.com.greymeta.phantom`, download
  `google-services.json` (goes in `android/app/`; the build already picks it up), and a service
  account key for the Edge Function.
- **Apple Push key**: Apple Developer → Keys → new key with APNs (and later VoIP). We need the
  `.p8` file, Key ID and Team ID. In Xcode, add the Push Notifications capability and
  Background Modes → Remote notifications (and Voice over IP for phase 3).
- Supabase secrets for the Edge Function: FCM service account, APNs key, token-encryption key.

## Store and privacy updates

- Privacy policy: push tokens, what a push contains (nothing about messages), retention, and
  that Apple/Google deliver them.
- Apple App Privacy / Google Data safety: check whether the push token counts as a device ID
  under current definitions, and declare it if so (App functionality, not linked to identity).
- Android 13+ needs the `POST_NOTIFICATIONS` runtime permission; iOS needs the standard prompt.

## Decisions for you

1. Default notification text: "New message" (recommended), or nothing visible (badge only)?
2. While disguised: disguise-styled text (recommended), or no notifications at all?
3. Include calls (phase 3) in the first release with push, or ship messages first?

## Known trade-off

To send a push, the server has to know which phone owns which inbox topics, so it can tell how
many conversations a phone has and when each is active (never with whom, and never what was
said). The Realtime doorbell already reveals the same while the app is open. People who don't
want that can leave push off; the app works as it does today.
