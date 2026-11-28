# Store listing copy

Character counts are checked against each store's limit. Replace `YOUR_DOMAIN` before you publish.
The description doesn't state prices, because the stores show them in local currency anyway.

## Google Play

**App name** (30 max): `Phantom - Secure Chat` (21). Home-screen label under the icon: `Phantom` (Android `title_activity_main`, iOS `CFBundleDisplayName`), which avoids truncation.

**Short description** (80/80):

```
Private, end-to-end encrypted messaging. No phone number, no email, no tracking.
```

**Full description** (3964/4000):

```
Phantom is a private messenger built so that nobody but you and the people you talk to can read your conversations. Not us, and not anyone who gets hold of our servers.

NO PHONE NUMBER. NO EMAIL. NO ACCOUNT.
You don't sign up with a phone number, an email address or a password. Phantom creates a cryptographic identity on your device, and you choose a display name, which doesn't have to be your real one. Your contacts never learn your number.

END-TO-END ENCRYPTED BY DEFAULT
Every message and attachment is encrypted on your device before it is sent, with AES-256-GCM and keys agreed using elliptic-curve Diffie–Hellman. Your private key never leaves your phone. Our relay only ever handles ciphertext.

FORWARD SECRECY
Phantom uses a ratchet that changes the encryption keys as you chat. Even if a key were ever exposed, past messages stay protected.

VERIFY WHO YOU'RE TALKING TO
Compare safety numbers in person or over another trusted channel to confirm that no one is sitting in the middle of your conversation. Phantom warns you if a contact's key changes.

BUILT TO LEAVE NO TRACE
• Disappearing messages with a timer you choose
• Messages padded to fixed sizes, so their length gives nothing away
• Undelivered messages are deleted from the relay automatically after 7 days
• Inactive inbox queues are removed after 30 days
• Your keys and messages are kept out of cloud backups
• Screenshots and screen recording are blocked on Android

LOCK IT DOWN
• Screen lock with a PIN or passphrase, protected by Argon2id
• Brute-force protection that locks out repeated wrong guesses
• Sentry Mode (Premium): set a decoy passcode that silently wipes the app and deletes your account
• Scrambled messages (Premium): your contact needs their fingerprint, face or PIN to read them, and three wrong tries delete the message
• App disguise (Premium): make Phantom look like a calculator, notes or weather app
• Locked notepad (Standard): private notes that open only with your fingerprint, face or PIN. Premium adds a decoy notes list in front
• Burn All Data erases the app in one tap

GROUPS AND ATTACHMENTS
Send photos and documents, protected the same way as your messages. Create encrypted group chats with Standard or Premium.

VOICE CALLS AND VOICE MESSAGES
Send encrypted voice messages (Standard), or call with end-to-end encryption (Premium). Premium's voice filter changes how you sound: deep, high or robot.

VANISHING GROUPS (PREMIUM)
Name a group, invite people and share messages, photos and videos that are wiped from our servers after 48 hours. Admins can invite, remove members or delete the group.

PIN DROPS (PREMIUM)
Share a location in a chat or group, from where you are or a spot you choose. Pins are end-to-end encrypted, and no map service sees them unless you choose to open one.

NO TRACKING. EVER.
No ads, no analytics and no third-party tracking SDKs. We don't sell or share your data. Our servers hold only what's needed to deliver your messages: your display name, your public key, and encrypted messages waiting to be delivered.

YOU'RE IN CONTROL
Delete your account at any time from Settings. Your public key, fingerprint, inbox queues and pending messages are removed from our servers, and everything is erased from your device. The directory ID and display name remain.

SUBSCRIPTION
Phantom is free for one-to-one messaging. Standard adds group chats, voice messages and a locked notepad. Premium adds vanishing groups, voice calls, a voice filter, scrambled messages, pin drops, a decoy notes list, app disguise and Sentry Mode. Both are auto-renewing monthly subscriptions. The price is shown in the app before you buy. Payment is charged to your store account when you confirm. The subscription renews automatically unless you cancel at least 24 hours before the end of the current period, and you can manage or cancel it any time in your store account settings.

Terms of Service: https://YOUR_DOMAIN/legal/terms.html
Privacy Policy: https://YOUR_DOMAIN/legal/privacy.html
```

## Apple App Store

**Name** (30 max): `Phantom - Secure Chat` (21)

**Subtitle** (30/30): `Encrypted. Anonymous. Private.`

**Promotional text** (144/170, can be changed without a new release):

```
Message without giving up your phone number or email. Every message is encrypted on your device, and our servers never hold the keys to read it.
```

**Keywords** (96/100, comma-separated, no spaces):

```
encrypted,secure,messenger,private,chat,anonymous,e2ee,privacy,disappearing,messages,secret,safe
```

**Description**: the same text as the Google Play full description above.


## Release notes

### 1.6.0: three plans and Premium features

Google Play "What's new" (389/500) and App Store "What's New in This Version" (389/4000).
The App Store doesn't show this field for an app's first version, so it only applies there from
the first update onward.

```
Phantom now has three plans:
• Free: encrypted one-to-one chat.
• Standard: adds group chats, voice messages and a locked notepad.
• Premium: adds vanishing groups (wiped after 48 hours), voice calls, a voice filter for calls and voice messages, pin drops, a decoy notes list, scrambled messages, app disguise and Sentry Mode.

Already subscribed? Tap Restore Purchases in Settings → Plan.
```

### 1.6.0-test: Internal testing / TestFlight

For the test build only (every feature unlocked). Play Console "Release notes" for the
Internal testing track (441/500), and TestFlight "What to Test".

```
TEST BUILD: every Premium feature is unlocked, no purchase needed.

New to try:
• Vanishing groups: photos, videos and messages wiped after 48 hours
• Voice calls and voice messages, with Deep, High or Robot voice filters
• Pin drops in chats and groups
• Locked notepad with a decoy list (add a note titled with your PIN)
• Scrambled messages, app disguise and Sentry Mode

Please report anything that fails to send, crashes or looks wrong.
```

Test checklist to send testers with it:

1. Two phones: add each other as contacts and send a text, a photo and a voice message.
2. Voice messages: record one with no filter and one with Robot. The other phone should hear only the filtered voice.
3. Voice call: call between the phones, switch filters during the call, mute, hang up.
4. Pin drop: send your current location, then one from a pasted Google Maps link. Tap "Open in Maps".
5. Vanishing group (needs a third phone): create it, invite two people, send a photo, a video and a voice message. Remove one person; they should lose the group, and the other two keep chatting.
6. Notepad: open Notes. It should show everyday notes without asking for a PIN. Add a new note with your PIN as its title: the list should scramble into your private notes, and no PIN note should be left behind. Add a private note, leave the app, and check Notes opens to the everyday notes again.
7. Scrambled message: turn on scrambling in a chat and send one; the other phone needs fingerprint, face or PIN to read it.
8. App disguise: switch to Calculator (needs a screen lock PIN). Reopen the app, type the PIN and press =.
9. Sentry Mode (last, it wipes the phone's Phantom data): set a panic PIN, enter it at the lock screen, and check the app opens fresh.
