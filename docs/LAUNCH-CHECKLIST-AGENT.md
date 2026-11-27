# PrepPilot: launch checklist for a browser agent

Written 27 Nov 2026 for an agent that works in the account owner's signed-in browser (Playwright).
The owner is **Priyanka Paladugula**. Every account below must be **hers**, not her husband's.
Work top to bottom. Tick each box, and at the end report what was done, what failed and why.

## Rules for the agent

- **Never type secrets into chat or logs.** Keys, tokens and passwords are pasted only into the site that needs them.
- **Personal details** (home address, personal phone, SSN, date of birth) must never be made public. Where a form asks for a *public* contact, use the support email/URL below, not the home address or phone.
- **Declarations are the owner's.** For legal statements (age rating, content rights, export compliance, tax forms, agreements), show the owner the proposed answers and get a "yes" before submitting.
- **Ask before** deleting anything, accepting agreements, paying, or pressing "Submit for Review".
- If a page looks different from what is described, stop and describe it; don't guess.

## Reference values

| What | Value |
|---|---|
| App name | **PrepPilot: Interview Prep** (fallback: `PrepPilot - Interview Prep`) |
| iOS bundle ID | `us.preppilot.app` |
| App Store app ID | `6839824503` |
| Pro subscription | `pro_monthly`, **$6.99/month**, **3-day free trial**, USA only |
| Live AI purchase | `mock_session_60min`, consumable, **$15.99**, USA only |
| Subscription group | `PrepPilot Pro` (display name "PrepPilot Pro") |
| Website | https://preppilot.us |
| Support / Privacy / Terms | https://preppilot.us/support.html · /privacy.html · /terms.html |
| Category | Education (secondary: Productivity) |
| Copyright | `2026 PrepPilot` |
| GitHub repo | https://github.com/ppaladugula1993/preppilot-interview (old repo `gouthamchidhara/preppilot` is archived) |
| Expo | account `ppaladugula`, project `preppilot` |
| RevenueCat | project `projda036fd0`, app "PrepPilot (App Store, us.preppilot.app)" |
| Azure | Static Web App `swa-preppilot-cmncqy5swqngi`, resource group `rg-preppilot` |
| Stripe | account "Preppilot" (`acct_1UgAz1F8LmgwChbn`) |

---

## 1. Apple: App Store Connect (https://appstoreconnect.apple.com)

Sign in with **Priyanka's** Apple ID (the new developer account), not the husband's.

### 1.1 Agreements, tax, banking
- [ ] **Business → Agreements**: the **Paid Apps** agreement is **Active**. If not, show the owner and let her accept it.
- [ ] **Bank account** added (her account for PrepPilot income).
- [ ] **Tax forms**: U.S. Form W-9 completed, as a sole proprietor, with her **EIN**. Owner confirms before submitting.

### 1.2 App Information (Apps → PrepPilot → App Information)
- [ ] **Name**: change "preppilot-interview prep" to **PrepPilot: Interview Prep**. If Apple says the name is in use, it is still held by the old app in the husband's account: tell the owner (that app must be removed there first) and use `PrepPilot - Interview Prep` for now.
- [ ] **Subtitle**: `Flashcards + AI mock interview` (already set; verify).
- [ ] **Category**: Primary **Education**, Secondary **Productivity**.
- [ ] **Content Rights**: propose "No, it does not contain, show, or access third-party content." *(owner confirms)*
- [ ] **Age Rating → Edit**: propose **None / No** for every item: no violence, sexual content, profanity, horror, drugs, alcohol, gambling, contests, medical info, mature themes, unrestricted web access, or user-to-user messaging (the AI coach is not messaging between users). Expected result **4+**. *(owner confirms)*
- [ ] **App Store Server Notifications** (Production and Sandbox, Version 2): the URL from RevenueCat (section 3). Verify it is there.
- [ ] **AIGC / China compliance** (App Compliance page, if shown): "Does your app offer AIGC services in China mainland?" → **No** (the app is US only).

### 1.3 Pricing and Availability
- [ ] **Price**: **Free** (USD 0).
- [ ] **Availability**: **United States only**. Uncheck every other country/region, and turn off "make available in new countries automatically".

### 1.4 App Privacy (Trust & Safety → App Privacy)
Propose these answers to the owner before publishing:
- [ ] Data collected and **linked to the user**, used for **App Functionality** only, **no tracking**:
  - Contact info: **Email address**, **Name**
  - **User ID**
  - **Audio data** (Live AI voice, processed only during a session the user starts)
  - **Other user content** (typed answers, résumé text the user pastes)
  - **Purchase history**
  - **Product interaction** (card progress)
- [ ] Privacy Policy URL: https://preppilot.us/privacy.html

### 1.5 Version 1.0 (Distribution → iOS App → 1.0 Prepare for Submission)
- [ ] **Screenshots** (iPhone 6.7"/6.9"): 6 are uploaded (swipe, learn, role, lab, live, home). Verify they show; re-upload from `store/screenshots/` in the repo if any are missing.
- [ ] **Promotional text, Description, Keywords, Support URL, Marketing URL**: already filled from `store/listing.json`. Verify; fix anything blank.
- [ ] **Copyright**: `2026 PrepPilot`.
- [ ] **App Review Information**: Sign-in required **off** (or provide a note: "Sign in with Apple works; no demo account needed"). **Contact**: owner's name, a contact **email**, and a **phone** number. This is private to Apple, so her phone is fine here. Notes are already filled.
- [ ] **Build**: once a build is in TestFlight (section 2), select it here.
- [ ] **Export compliance** (asked when selecting the build): the app uses only standard encryption (HTTPS) → "uses standard encryption only / exempt". *(owner confirms)*

### 1.6 Subscriptions and in-app purchase
- [ ] **Subscriptions → PrepPilot Pro → PrepPilot Pro Monthly**: price **$6.99**, **Introductory Offer: Free, 3 days**, availability **US**, localization "PrepPilot Pro" / "Unlimited AI coach + 30 Live AI minutes a month", review screenshot and review note present. Status should leave "Missing Metadata" once everything is filled.
- [ ] **Subscription group "PrepPilot Pro" → App Store Localization**: English (U.S.) display name "PrepPilot Pro".
- [ ] **In-App Purchases → Live AI 60 Minutes**: **Price Schedule → +** → **$15.99**, base country **United States**. (The check on 27 Nov found **no price set**.) Availability **US**, localization "Live AI, 60 minutes", review screenshot and note present.
- [ ] On version 1.0, under **In-App Purchases and Subscriptions**, add **both** products so they are submitted together with the app.

### 1.7 Users and Access → Integrations
- [ ] **App Store Connect API** key exists (role App Manager or Admin) and is saved in GitHub secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` (section 6).
- [ ] **In-App Purchase** key exists and is uploaded to RevenueCat (section 3).

### 1.8 Old app in the husband's account
- [ ] Ask the owner: in the husband's App Store Connect, remove the unreleased app "PrepPilot: Interview Prep" (`com.gchid.preppilot`, app 6835532732) so its name is freed. **Owner/husband must confirm before removing.**

---

## 2. TestFlight

- [ ] After a build finishes in Expo (https://expo.dev/accounts/ppaladugula/projects/preppilot/builds), it is uploaded by the GitHub workflow **"iOS release (EAS build + TestFlight)"** (run with **upload_only** = true if the build already exists).
- [ ] App Store Connect → **TestFlight**: the build appears and finishes "Processing".
- [ ] Answer **export compliance** for the build if asked (standard encryption only). *(owner confirms)*
- [ ] Add an **internal testing group** with the owner's Apple ID and install via the TestFlight app.
- [ ] On the iPhone: open the app, **Sign in with Apple**, open Pricing, buy **Pro** with a **sandbox** tester (check "3 days free" shows), **Restore purchases**, start a short **Live AI** session. Report results with screenshots.

---

## 3. RevenueCat (https://app.revenuecat.com)

- [ ] Project `projda036fd0` → **Apps** → "PrepPilot (App Store, us.preppilot.app)": bundle ID `us.preppilot.app`; **In-App Purchase key** uploaded; **App Store Connect API key** uploaded. (Verified set on 27 Nov.)
- [ ] **App Store Connect vendor number**: add it (App Store Connect → Payments and Financial Reports, top left).
- [ ] **Products**: `pro_monthly` and `mock_session_60min` exist for this app.
- [ ] **Entitlement `pro`**: includes `pro_monthly` for this app.
- [ ] **Offering `default`** (current): package **$rc_monthly** has `pro_monthly`; package **mock_session_60min** has `mock_session_60min`.
- [ ] **Integrations → Webhooks**: one webhook pointing to `https://preppilot.us/api/billing/revenuecat?...` (keep its existing auth). Do not delete it.
- [ ] Copy the **App Store Server Notifications URL** shown for this app into App Store Connect (section 1.2).
- [ ] Ownership: if this RevenueCat account belongs to the husband, note it for the owner. Moving the project to her account is a separate task.

---

## 4. Google Cloud: Google sign-in (https://console.cloud.google.com)

Project: the one that owns OAuth client `372383686135-...` (Google Sign-In for PrepPilot).

- [ ] **APIs & Services → Credentials → Create credentials → OAuth client ID → iOS**:
  - Name: `PrepPilot iOS (us.preppilot.app)`
  - Bundle ID: `us.preppilot.app`
  - Team ID: the owner's Apple **Team ID** (developer.apple.com → Membership details)
- [ ] Copy the new **iOS client ID** (ends in `.apps.googleusercontent.com`) and the **iOS URL scheme** (reversed client ID) and give both to the owner. A developer updates `mobile/app.settings.json` (`googleIosClientId`) and the Azure setting `GOOGLE_CLIENT_IDS` (add the new ID, keep the existing ones).
- [ ] **OAuth consent screen**: app name "PrepPilot", support email = the owner's contact email (not a personal home address), app home page https://preppilot.us, privacy https://preppilot.us/privacy.html, terms https://preppilot.us/terms.html. Publishing status **In production**.
- [ ] Ownership: under **IAM & Admin → IAM**, make sure the owner's Google account is an **Owner** of the project. If the project belongs to the husband, add her as Owner and note it.

---

## 5. Expo (https://expo.dev)

- [ ] Account **ppaladugula** → project **preppilot** → **Credentials → iOS → us.preppilot.app**: a **Distribution Certificate** and **Provisioning Profile** exist, issued by the **owner's** Apple team.
- [ ] **App Store Connect API key** set for this bundle (optional; the GitHub workflow can supply it).
- [ ] **Account settings → Access tokens**: a token exists and is saved as GitHub secret `EXPO_TOKEN` (section 6).

---

## 6. GitHub (https://github.com/ppaladugula1993/preppilot-interview)

- [ ] **Settings → Secrets and variables → Actions** contains: `AZURE_STATIC_WEB_APPS_API_TOKEN`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `EXPO_TOKEN`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`. (Values are never shown; just confirm the names exist.)
- [ ] **Actions** tab: recent "Deploy PrepPilot" runs are green. "Refresh interview questions" and "Refresh tech feed" run on schedule.
- [ ] Old repo `gouthamchidhara/preppilot` shows **Archived**.

---

## 7. Azure (https://portal.azure.com)

- [ ] Static Web App **swa-preppilot-cmncqy5swqngi** → **Environment variables**:
  - `APPLE_AUDIENCES` = `us.preppilot.app,com.gchid.preppilot`
  - `GOOGLE_CLIENT_IDS` includes the new iOS client ID from section 4 (comma-separated, keep existing).
  - `PRO_PRICE_LABEL` not set (code default is `$6.99/month`) or equals `$6.99/month`.
- [ ] Ownership: **Subscription → Access control (IAM)**: the owner's Microsoft account is **Owner**. If the subscription is the husband's, note it; moving billing ownership is a separate task.
- [ ] **Custom domain** `preppilot.us` shows as validated.

---

## 8. Stripe (https://dashboard.stripe.com)

- [ ] **Settings → Business → Public details**: **remove the support phone**, **remove or replace the support address** (must not be the home address; use a virtual mailbox if Stripe requires one), set **support email** and **support URL** `https://preppilot.us/support.html`.
- [ ] **Settings → Customer emails**: receipts do not show the home address.
- [ ] Account status: identity **verified**; the **rejection appeal** is under review (submitted 26–27 Nov). Report the current status shown on the Dashboard home.
- [ ] **EIN** added to the account (as a sole proprietor).
- [ ] **Settings → Payouts**: a bank account is added.
- [ ] Do **not** create products or turn on live payments; that comes later.

---

## 9. Domain

- [ ] Find where **preppilot.us** is registered (registrar account) and note whose account it is. If it's the husband's, note it for the owner (transfer is a separate task).

---

## Report back

For each section: ✅ done, ⚠️ needs the owner (with what exactly), or ❌ failed (with the error text and a screenshot). List any account that still belongs to the husband.
