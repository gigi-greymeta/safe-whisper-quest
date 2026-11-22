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
