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

One auto-renewing monthly subscription, required in the iOS and Android apps only (the web
build is free). Code: `src/lib/subscription.ts`, `src/components/Paywall.tsx`, gate in
`src/App.tsx`. Billing goes through `@capgo/native-purchases`, which talks directly to StoreKit 2
and Play Billing, with no third-party service. Entitlement is checked on the device only, so a
user who tampers with the app could get round it. That was an accepted trade-off.

| Setting | Value |
| --- | --- |
| Product ID (both stores) | `phantom_premium_monthly` |
| Google Play base plan ID | `monthly`: auto-renewing, 1 month, **no free-trial or intro offer** |
| Apple subscription group | `Phantom Premium`, duration 1 month, no introductory offer |
| Launch price | $9.99/month |

**Apple (App Store Connect):** sign the Paid Apps Agreement and add banking and tax details
first. Then go to Monetization → Subscriptions, create the group and the product, set the price,
and add a display name, a description and a review screenshot of the paywall. Attach the
subscription to the app version when you submit it. In Xcode, add the **In-App Purchase**
capability under Signing & Capabilities.

**Google (Play Console):** set up a payments profile. Then go to Monetize → Products →
Subscriptions, create `phantom_premium_monthly` with base plan `monthly`, set the price and
activate it. Upload a build that includes billing (internal testing is enough) before the
product can be tested.

**Founding price (first 20 subscribers):** neither store can cap a price by number of
subscribers. Track the count in the store consoles. At 20, change the price to **$15.99** for
**new subscribers only**:
- Apple: Subscription → Subscription Prices → Plan a price change, and choose to **keep the
  current price for existing subscribers**.
- Google: Base plan → Edit price, and choose to keep existing subscribers on the legacy price.
Existing subscribers keep $9.99 for as long as they stay subscribed. The app shows the store's
price automatically.

**Owner accounts (free):** use store offer codes. Don't use in-app codes or allowlists, which
break App Store rule 3.1.1.
- Apple: Subscription → Offer Codes, create a "Free" offer (the longest available duration) for
  new and existing customers, and generate 2 one-time codes. Owners redeem them with **Redeem
  Code** on the paywall. Issue new codes before they run out.
- Google: Monetize → Promo codes, create a subscription promo for `phantom_premium_monthly`.
  Owners redeem it at `play.google.com/redeem`, then tap **Restore Purchases**.
- Before release, testers can use Apple Sandbox / TestFlight and Google license testers
  (Play Console → Settings → License testing), and aren't charged.

**Store declarations:** purchase data stays with Apple and Google, and the app never sends it to
the relay. So "Purchase history" is **not collected** in Apple App Privacy or the Play Data
safety form.

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
