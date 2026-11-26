# App Review notes

Reply to App Review's request for more information (Guideline 2.1). Paste the block below into
App Store Connect > the app version > App Review Information > **Notes** (3646/4000), then resubmit.

```
1. SCREEN RECORDING
[Paste the link to the screen recording here, e.g. an iCloud Drive or Dropbox link, recorded on an iPhone running the latest iOS.]

2. PURPOSE AND AUDIENCE
Phantom is a private messenger for adults who need to communicate without being tracked or exposed: people at risk of domestic abuse or stalking, journalists and their sources, and anyone who wants strong privacy. It needs no phone number, email or password. Messages, calls, photos and files are end-to-end encrypted on the device, so neither we nor anyone with access to our servers can read them. Safety features help people in danger: a decoy app icon, a decoy notes list, and a panic PIN that wipes the app.

3. HOW TO USE IT (no login or demo account needed)
- Launch, read the intro, and create an identity with any display name. That is the account; no credentials are required.
- Messaging needs a second identity. Install Phantom on a second device and create another identity, or add our review contact: Contacts > + > search "[DEMO NAME]". That identity is monitored during review and will reply.
- Tabs: Chats, Contacts, Settings. In a chat: send text, photos, voice messages and pins (map pin icon); call with the phone icon.
- Paid features use In-App Purchase (Settings > Data > Plan). Standard (phantom_standard_monthly): group chats, voice messages, locked notepad. Premium (phantom_premium_monthly): vanishing groups, voice calls, voice filter, pin drops, decoy notes, scrambled messages, app disguise and panic PIN. Use a Sandbox account to subscribe. Restore Purchases is on the same screen.
- Report and block: in a chat, tap ⋮ > Report or ⋮ > Block. In a vanishing group, tap Members, then the flag next to a person. Blocked people are listed under Settings > Security > Blocked people.
- Delete account: Settings > Data > Delete Account. This deletes the identity on our server and erases the device.

Safety features (disclosed here so nothing is hidden):
- App disguise (Settings > Security > App Disguise): changes the home-screen icon to Calculator, Notes or Weather. With Calculator, the app opens to a working calculator; type the app PIN and press = to open Phantom. A screen lock PIN must be set first (Settings > Security > Screen Lock). Test PIN: set your own, e.g. 1234.
- Notes (notebook icon on the Chats tab): opens to everyday decoy notes. Adding a new note titled with the app PIN reveals the private notes.
- Panic PIN (Settings > Security > Sentry Mode): a second PIN that, if entered at any PIN prompt, deletes the account on our server and wipes the app.
- Scrambled messages (eye icon in a chat): the recipient must use Face ID or their PIN to read them.

4. EXTERNAL SERVICES
- Supabase: hosts our encrypted message relay, public key directory, vanishing-group storage and abuse reports. It only stores ciphertext for messages.
- Apple In-App Purchase (StoreKit) for subscriptions.
- Cloudflare public STUN server, used only to connect voice calls between devices; call audio is encrypted end to end.
- Apple Maps, opened only when a user taps "Open in Maps" on a shared pin.
No AI services, analytics, advertising, tracking or third-party login are used.

5. REGIONS
The app works the same in every region, with the same features and content. Prices are set per region by the App Store.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not applicable: Phantom is not in a regulated industry and contains no licensed third-party content. It uses standard encryption (AES-256-GCM, ECDH, ECDSA via the iOS WebKit Web Crypto API) and our export compliance answers are provided in App Store Connect.

Contact: hello@greymeta.com.au
```

## Before resubmitting

- [ ] Run `supabase db push`. The new `abuse_reports` migration must be live, or Report fails during review. This also covers the vanishing-groups and 512 KB relay migrations if they aren't live yet.
- [ ] Keep a second phone signed in as the demo identity during review, replace [DEMO NAME] in the notes with its display name, and reply to messages from the reviewer.
- [ ] Upload the **store** build (not the unlocked test build), with both subscriptions (phantom_standard_monthly, phantom_premium_monthly) attached to the version: App Store Connect > the version > In-App Purchases and Subscriptions (Guideline 3.1.1).
- [ ] Screenshots show the app in use: chats, a call, notes, and so on, not just the intro (Guideline 2.3.3).
- [ ] Answer the encryption export questions in App Store Connect. Section 6 of the notes says they're provided.
- [ ] Record the video (shot list below), upload it, and paste the link into section 1.
- [ ] Check someone reviews new rows in the Supabase `abuse_reports` table at least daily.

## Screen recording shot list

Record on an iPhone running the latest iOS (Control Centre > Screen Recording, with the
microphone off unless you narrate). Aim for 4 to 6 minutes. Use the store build with a Sandbox
Apple ID, not the unlocked test build. Use a second phone as the other person.

1. Start on the home screen and tap the Phantom icon (Apple requires the recording to begin with launch).
2. Intro screens, then Create Identity with a display name.
3. Contacts > Add contact > find the second phone's identity and add it.
4. In the chat: send a text, a photo and a voice message; show a reply arriving.
5. Settings > Data > Plan: subscribe to Premium with the Sandbox account (show Apple's purchase sheet), then show Restore Purchases.
6. Back in the chat: drop a pin, send a scrambled message (eye icon) and start a voice call; switch the voice filter during the call, then hang up.
7. Chats > Vanishing groups: create a group, invite the second phone, post a photo; open Members.
8. Chats > Notes (notebook icon): show the decoy notes, add a note titled with your PIN, show the scramble reveal.
9. Settings > Security: App Disguise > Calculator. Go home, open the app, type the PIN and press =. Switch the disguise back to Phantom.
10. Report and block: in the chat, ⋮ > Report > pick a reason > Send report. Then ⋮ > Block > Block. Show Settings > Security > Blocked people with Unblock.
11. Account deletion: Settings > Data > Delete Account > confirm, and show the app back at the first screen.

Upload the video somewhere Apple can open without signing in (an iCloud Drive or Dropbox share link), and paste the link at the top of the notes.
