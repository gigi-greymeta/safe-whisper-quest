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
| iOS | `NSCameraUsageDescription` | The WKWebView file picker offers "Take Photo" for image attachments. Without this key the app crashes. | `ios/App/App/Info.plist` |
| iOS | `NSPhotoLibraryUsageDescription` | Choosing a photo to attach | `ios/App/App/Info.plist` |

No microphone, location, contacts, notifications or storage permissions. Android photo
attachments go through the system picker, which needs no permission.

Hardening in the native projects:
- Android: `allowBackup=false`, plus `data_extraction_rules.xml`, which keeps keys out of
  Google backup and device transfer. `FLAG_SECURE` in `MainActivity` blocks screenshots,
  screen recording and the recents thumbnail. Remove that flag temporarily to take store
  screenshots.
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
- **User-generated content (1.2):** blocking means removing the contact. Reports go to the
  contact email in the terms. App Review may ask for an in-app "Report" action; consider
  adding one to the chat menu.
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
