# App Store and Google Play compliance

What Phantom declares to Apple and Google, and where each item lives in the repo.
Keep this, `public/legal/privacy.html` and `ios/App/App/PrivacyInfo.xcprivacy` in sync.
If you add a permission, an SDK, or new server-side data, update all three.

## Before the first submission

1. Replace `CONTACT_EMAIL` in `public/legal/*.html` with a monitored mailbox. Google requires
   a working deletion contact, and Apple requires published contact details.
   `grep -rl CONTACT_EMAIL public/legal | xargs sed -i 's/CONTACT_EMAIL/you@example.com/g'`
2. Deploy the web build to the production domain. The policy URLs below need to be public.
3. Deploy the backend pieces (deletion fails until these are live):
   ```bash
   node scripts/generate-deletion-key.mjs           # prints a private JWK
   supabase secrets set DELETION_KEY_PRIVATE_JWK='<that JSON>'
   supabase functions deploy delete-identity
   supabase db push                                  # purge_expired_relay_messages cron
   ```
4. Turn off or remove the in-app Debug Console (Settings → Data) in store builds. It loads
   Eruda from jsDelivr, which the privacy policy doesn't list as a third party.

## Subscription

Three plans. Free needs no purchase. Standard and Premium are auto-renewing monthly
subscriptions in **one subscription group**, so moving between them is an upgrade or downgrade,
not a second purchase. The web build can't take payments and always runs as Free; phone and
tablet browsers are sent to the store apps instead (`src/components/GetTheApp.tsx`).

Code: plans and feature gates in `src/lib/subscription.ts` (`FEATURE_TIER`), current plan in
`src/hooks/useTier.ts`, plan picker in `src/components/Paywall.tsx` (route `/upgrade`). Billing
goes through `@capgo/native-purchases`, which talks directly to StoreKit 2 and Play Billing, with
no third-party service. Entitlement is checked on the device only, so a user who tampers with the
app could get round it. That was an accepted trade-off.

| Plan | Price | Includes |
| --- | --- | --- |
| Free | $0 | One-to-one encrypted chat, delete after read, screen lock |
| Standard | $3.99/month | Free + group chats |
| Premium | $10.99/month | Standard + Sentry Mode panic PIN, scrambled messages, app disguise, voice calls with voice filter |

Scrambled messages, app disguise and calls aren't built yet and show as "coming soon" on the plan
picker. Apple may reject a subscription sold on features that don't exist yet, so either ship
them before Premium goes live, or tell App Review in the notes exactly what Premium unlocks today.

| Setting | Standard | Premium |
| --- | --- | --- |
| Product ID (both stores) | `phantom_standard_monthly` | `phantom_premium_monthly` |
| Google Play base plan ID | `monthly` | `monthly` |
| Apple subscription group | `Phantom` | `Phantom` |
| Apple group level | 2 | 1 (highest) |

All base plans and products: auto-renewing, 1 month, **no free trial or introductory offer**.

**Apple (App Store Connect):** sign the Paid Apps Agreement and add banking and tax details
first. Then go to Monetization → Subscriptions, create the group and both products, set the prices,
rank Premium above Standard in the group, and add a display name, a description and a review
screenshot of the plan picker for each. Attach both subscriptions to the app version when you
submit it. In Xcode, add the **In-App Purchase** capability under Signing & Capabilities. Apple
handles upgrades (immediate, prorated refund) and downgrades (at renewal) inside the group.

**Google (Play Console):** set up a payments profile. Then go to Monetize → Products →
Subscriptions, create both products, each with base plan `monthly`, set the prices and activate
them. Upload a build that includes billing (internal testing is enough) before the products can
be tested.

**Switching plans on Android:** the billing plugin can't pass Play's subscription-replacement
parameters, so buying the second plan would bill for both. The plan picker tells Android
subscribers to cancel their current plan in Google Play first. Fixing this properly needs
replacement support added to the plugin.

**Downgrades:** Free users can still read existing groups but can't create groups or send to them.
A panic PIN set while on Premium keeps working after a downgrade, so nobody relying on it under
duress is left with a PIN that silently does nothing; setting a new one needs Premium.

**Owner accounts (free, all features):** use store offer codes on **Premium**, which includes
everything. Don't use in-app codes or allowlists, which break App Store rule 3.1.1.
- Apple: Subscriptions → Phantom Premium → Offer Codes, create a "Free" offer (the longest
  available duration) for new and existing customers, and generate one-time codes. Owners redeem
  them with **Redeem Code** on the plan picker (Settings → Plan). Issue new codes before they run out.
- Google: Monetize → Promo codes, create a subscription promo for `phantom_premium_monthly`.
  Owners redeem it at `play.google.com/redeem`, then tap **Restore Purchases**.
- Before release, testers can use Apple Sandbox / TestFlight and Google license testers
  (Play Console → Settings → License testing), and aren't charged.

**App Store link:** once the iOS listing exists, set `VITE_APP_STORE_URL` (for example
`https://apps.apple.com/app/id1234567890`) in the web build's environment so the "Get the app"
page links to it. Until then it shows "Coming soon to the App Store".

**Store declarations:** purchase data stays with Apple and Google, and the app never sends it to
the relay. So "Purchase history" is **not collected** in Apple App Privacy or the Play Data
safety form.

## Premium features

| Feature | Code | Notes |
| --- | --- | --- |
| Scrambled messages | `src/lib/scramble.ts`, `src/components/UnscrambleDialog.tsx` | Sending needs Premium; anyone can unscramble. Biometrics via `@capgo/capacitor-native-biometric`, or the app PIN. 3 failures delete the message on that device. The panic PIN works at this prompt too. |
| Sentry Mode panic PIN | `src/store/lock.ts`, `handlePanicWipe` in `src/App.tsx` | Deletes the account on the server (up to 4 s), then wipes the device: app data, every IndexedDB database, Cache Storage, service workers, cookies, and natively the WebView cache/storage/cookies plus the app cache folders (`DeviceWipePlugin` on Android and iOS; `src/lib/deviceWipe.ts`). The Settings → Emergency Panic Wipe button clears caches too. A copy of the identity key is sealed under the panic PIN so this works from the lock screen. Panic PINs set before this release only delete the server account when entered while the app is unlocked; setting the PIN again fixes that. |
| App disguise | `src/lib/disguise.ts`, `AppDisguisePlugin` (Android `java/…/AppDisguisePlugin.java`, iOS `ios/App/App/AppDisguisePlugin.swift`), `src/components/CalculatorDecoy.tsx` | Android switches launcher activity-aliases (icon and name). iOS uses alternate app icons (icon only; iOS shows its own notice). Calculator needs Screen Lock with a PIN: the app opens to a working calculator, PIN then = unlocks. A disguise stays on after a downgrade or panic wipe. Artwork in `resources/disguise/`, regenerate with `scripts/generate-disguise-icons.mjs`. |
| Locked notepad | `src/pages/Notepad.tsx`, `src/components/notes/`, `src/store/notes.ts` | **Standard** (the decoy list is Premium). Home → Notes. Unlock with fingerprint/face and/or PIN (app PIN or a separate notes PIN), chosen in notes settings. Decoy list (Premium, on by default, can be turned off): Notes opens with no PIN to a random set of everyday notes (picked once from a pool of 24, then kept; "Shuffle decoy notes" in settings re-picks). Adding a new note titled with the PIN plays a character-scramble animation that turns the decoy list into the real notes; the PIN note is never saved, other titles become ordinary decoy notes, and the panic PIN as a title wipes the app. Titles that look like a PIN count toward the lockout. Real notes are encrypted with a key from the identity and stored in the PIN vault; they lock when the app goes to the background. With the Notes disguise on, the locked app opens to the decoy list, and a new note titled with the app PIN unlocks the app. After a downgrade, existing notes can still be opened and deleted, but new ones need a paid plan, and the decoy list switches off. |
| Message requests | `src/lib/requests.ts`, `src/contexts/RequestsContext.tsx`, `src/components/MessageRequests.tsx` | Someone not in your contacts can't reach your private channels, so adding you, a first message (with a preview, re-sent at most every 6 hours until you reply), and group invites (standard and vanishing) also go to your request inbox: an owner-only relay v2 inbox at SHA-256("phantom-request-inbox-v1:" + fingerprint), registered before the fingerprint is published for new users. Requests are sealed to your identity key (sender hidden from the server) and authenticated with the sender/recipient static key. Chats → Direct shows them with Accept / Decline / Block; accepting adds the contact so their waiting messages arrive, or joins the group. In-app alerts for new requests and new messages (sender name only); no alerts while the app is closed (no push). Known limit: an existing user's request inbox could be registered by someone else before their phone first runs this version; that blocks requests but can't reveal them. |
| Vanishing groups | `src/contexts/VanishingGroupsContext.tsx`, `src/lib/vanishing/`, `src/pages/VanishingGroup*.tsx`, `supabase/migrations/20261123000000_vanishing_groups.sql` | Home → Vanishing groups. Creating needs Premium; anyone invited can join. See "Vanishing groups" below. |
| Pin drops | `src/lib/location.ts`, `src/components/PinDropDialog.tsx`, card in `MessageBubble.tsx` | One-to-one and group chats. Current GPS location, or coordinates / a Google or Apple Maps link pasted in, plus an optional label. No in-app map (map tiles would leak the location to a tile provider); "Open in Maps" hands off to the maps app on tap. Sending needs Premium; anyone can open a pin. |
| Voice messages | `src/lib/voiceMessage.ts`, `src/components/VoiceRecorder.tsx`, `VoiceNotePlayer.tsx` | Mic button in one-to-one chats, groups and vanishing groups. Premium users record through the call voice filter (Off / Deep / High / Robot, changeable mid-recording), so only filtered audio exists. Up to 2 minutes; in chats it's capped at 230 KB to fit the relay (raised to 512 KB per message by `20261123010000_relay_payload_512kb.sql`); vanishing groups send it as encrypted media. Played from memory only. **Standard** can send; the voice filter while recording is Premium; anyone can play. |
| Voice calls and voice filter | `src/contexts/CallContext.tsx`, `src/lib/calls/` | Starting a call needs Premium; anyone can answer. Setup messages go end-to-end encrypted over the relay. Calls only ring while the app is open (no push service). Filters run in an AudioWorklet on the caller's device. |

## Vanishing groups

Group chats whose messages, photos and videos are wiped from the server 48 hours after posting.
The creator is the first admin and can make others admins. Any admin can rename the group,
invite, remove members, make or remove admins, and delete the group. Anyone can leave (the
last admin must hand over first, or delete the group).

Lifetime:
- **Content** expires 48 hours after posting (server-set; purge every 5 minutes).
- **The group** stays while at least one admin uses the app: admin phones check in with the
  server at most hourly while the app is open (`vg_admin_ping`, and every state change). With no
  admin activity for 48 hours, the purge removes the group and everything in it. An admin's
  "Delete group for everyone" removes it at once.
- **Wiping an admin's phone** (panic PIN, reset, burn, account deletion) clears the history of
  their groups but leaves the groups for other members (`vg_clear_queue`).

How it's secured:
- **Server sees only ciphertext.** Messages, media and the group state are encrypted. The group
  state (name, members, admins, invites) is encrypted with a state key, signed by the admin who
  changed it, and the keys are sealed to each member's identity key in **unlabelled** boxes, so
  the server can't read the name, count fingerprints or tell who is in a group
  (`src/lib/vanishing/state.ts`). Tables have RLS on and no policies; only the `vg_*`
  functions are callable, and they act on the one address supplied.
- **Only admins can change the group.** Writing state needs the admin token (sealed only to
  admins). Members accept a new state only if it's newer, signed by someone they already trust
  as an admin, and commits to the address and keys in their box. Demoting an admin replaces the
  token. Tests cover self-promotion, forged signatures and removed members.
- **Removing a member** moves the group to a new address and keys; the old address keeps a
  forwarding note sealed only to the people who remain, and its history is wiped.
- **Daily key ratchet**, per-sender message signatures, 512-byte padding, per-file media keys
  and memory-only display, as before.
- **Invites** go over the pairwise end-to-end channels from the inviting admin, who must have
  the invitee as a contact.

**Deploy:** `supabase db push` applies `20261123000000_vanishing_groups.sql`,
`20261126010000_vanishing_groups_stay_active.sql` and `20261126020000_vanishing_groups_admins.sql`.

**Call servers:** set `VITE_TURN_URLS`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` in the
build environment to route every call through a TURN relay, so neither person sees the other's
IP address. Without TURN, calls use STUN (`VITE_STUN_URLS`, default Cloudflare's public server),
connect directly, and fail on some strict networks. Name the STUN/TURN provider in the privacy
policy's call section once chosen. TURN credentials built into the app can be extracted; use a
provider that issues short-lived credentials before relying on it at scale.

**App Review notes for Premium:** say that app disguise changes the home-screen icon to the
user's choice of Calculator, Notes or Weather (original artwork, not imitating another app), and
that with the Calculator disguise the app opens to a working calculator; typing the app PIN and
pressing = opens Phantom. With the Notes disguise (or the notepad's decoy list), adding a new
note whose title is the PIN unlocks it. Give reviewers a test PIN. Apple rejects hidden features that aren't
disclosed (Guideline 2.3.1).

## Policy URLs

| Purpose | URL |
| --- | --- |
| Privacy policy | `https://YOUR_DOMAIN/legal/privacy.html` |
| Terms of service (EULA) | `https://YOUR_DOMAIN/legal/terms.html` |
| Account deletion (Play: "Delete account URL") | `https://YOUR_DOMAIN/legal/delete-account.html` |
| Data deletion (Play: "Delete data URL", optional) | `https://YOUR_DOMAIN/legal/delete-data.html` |

In-app: Settings → Data → **Delete Account** (`/settings/delete-account`) and the **Legal &
Privacy** links. The identity creation screen links to the terms and privacy policy.

## Device permissions

| Platform | Permission | Why | File |
| --- | --- | --- | --- |
| Android | `INTERNET` | Relay | `android/app/src/main/AndroidManifest.xml` |
| Android | `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS` | Voice calls (Premium) and voice messages (Standard) | `android/app/src/main/AndroidManifest.xml` |
| Android | `USE_BIOMETRIC` (merged from androidx.biometric) | Unscrambling messages | plugin manifest |
| iOS | `NSMicrophoneUsageDescription` | Voice calls (Premium) and voice messages (Standard) | `ios/App/App/Info.plist` |
| iOS | `NSFaceIDUsageDescription` | Unscrambling messages, opening locked notes | `ios/App/App/Info.plist` |
| Android | `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION` | Pin drops (Premium), only on tap | `android/app/src/main/AndroidManifest.xml` |
| iOS | `NSLocationWhenInUseUsageDescription` | Pin drops (Premium), only on tap | `ios/App/App/Info.plist` |
| Android | `CAMERA` (camera hardware optional) | In-app QR scanner: adding a contact, checking a safety number. Frames are decoded on the device, never stored or sent. Play Data safety: no data collected (on-device processing only). | `android/app/src/main/AndroidManifest.xml` |
| iOS | `NSCameraUsageDescription` | In-app QR scanner, and the WKWebView file picker's "Take Photo" for image attachments. Without this key the app crashes. | `ios/App/App/Info.plist` |
| iOS | `NSPhotoLibraryUsageDescription` | Choosing a photo to attach | `ios/App/App/Info.plist` |

No location, contacts, notifications or storage permissions. Android photo attachments go
through the system picker, which needs no permission. The microphone is opened only during a
call. Call audio is end-to-end encrypted between devices and never reaches the developer, so it
is **not collected** for Apple App Privacy or the Play Data safety form. Biometric checks run
on the device only and are not collected either. Pin drops are end-to-end encrypted between
users, so location is **not collected** either (Google exempts end-to-end encrypted data;
Apple's "collected" means sent off the device in a form the developer can access). Notepad
notes never leave the device.

Hardening in the native projects:
- Android: `allowBackup=false`, plus `data_extraction_rules.xml`, which keeps keys out of
  Google backup and device transfer. `FLAG_SECURE` in `MainActivity` blocks screenshots,
  screen recording and the recents thumbnail. To record or screenshot, add
  `phantomAllowScreenCapture=true` to `android/gradle.properties` for that build only, and remove it
  before a Play release.
- iOS: `AppDelegate` excludes `Library/WebKit` (where WKWebView keeps local storage) from
  iCloud/iTunes backups.

## Apple: App Store Connect

**App Privacy** (must match `PrivacyInfo.xcprivacy`):

| Data type | Collected | Linked to user | Tracking | Purpose |
| --- | --- | --- | --- | --- |
| Contact Info → Name (display name) | Yes | Yes | No | App Functionality |
| Identifiers → User ID (key fingerprint) | Yes | Yes | No | App Functionality |
| Messages, photos | Not collected: end-to-end encrypted, unreadable by the developer | | | |

- **Account deletion (Guideline 5.1.1(v)):** in-app, at Settings → Data → Delete Account.
- **User-generated content (1.2):** in a chat, ⋮ → **Report** (reason, details, optionally the
  person's last 10 messages, optional reply email, "Also block") and ⋮ → **Block** (removes the
  contact, stops their messages, prevents re-adding, hides their vanishing-group posts). In a
  vanishing group, the flag next to each member reports them. Settings → Security → **Blocked
  people** lists and unblocks. Reports land in the `abuse_reports` table (migration
  `20261126000000_abuse_reports.sql`, insert-only from the app); review them in the Supabase
  dashboard at least daily and fill in `handled_at`. Contact email: hello@greymeta.com.au.
- **Export compliance:** Phantom implements its own end-to-end encryption (AES-GCM / ECDH /
  ratchet). Answer **Yes** to "uses encryption". It most likely qualifies for the
  mass-market exemption (EAR Category 5 Part 2), but confirm that with your adviser. US rules
  may need an annual self-classification report to BIS, and distributing in France may need
  an ANSSI declaration. Once you've decided, add `ITSAppUsesNonExemptEncryption`, plus
  `ITSEncryptionExportComplianceCode` if one is issued, to `Info.plist`. That stops App Store
  Connect asking on every upload. Until then it is intentionally left unset.
- **Review notes:** "No login. Create an identity with any display name. To test messaging,
  create a second identity on another device and add it from Contacts."
- **Age rating:** answer yes to unrestricted user-to-user communication.

## Google: Play Console

**Data safety:**
- Collects data: **Yes**. Shares data: **No**.
- Encrypted in transit: **Yes**. Users can request deletion: **Yes** (URLs above).
- Data types (all *required*, purpose *App functionality*, not shared):
  - Personal info → **Name** (display name)
  - Personal info → **User IDs** (key fingerprint)
- Not declared: messages and photos. Google exempts data that is end-to-end encrypted so that
  only the sender and recipient can read it.

**App content:**
- Account deletion: the app lets users create an account, so give the Delete account URL above.
- Privacy policy URL: above.
- Target audience: 13+. Ads: none.
- Financial features, health, government: none.

**Target API:** `targetSdkVersion 36` (`android/variables.gradle`).
