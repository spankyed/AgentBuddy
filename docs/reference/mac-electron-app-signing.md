# Electron macOS Code Signing & Notarization Setup (Apple Developer)

This guide documents the full process for setting up:

* macOS code signing
* Apple notarization
* GitHub Actions CI signing
* Electron distribution outside the Mac App Store

for an Electron app using the Apple Developer Program.

---

# What This Setup Achieves

After completing this setup, you will be able to:

✅ Sign Electron macOS apps
✅ Notarize apps with Apple
✅ Prevent Gatekeeper warnings
✅ Ship trusted `.dmg` / `.zip` builds
✅ Automate signing in GitHub Actions CI

---

# Requirements

You need:

* Apple Developer Program membership
* macOS machine
* Electron app
* GitHub repository
* Electron Builder / Forge / custom signing pipeline

---

# Overview of the Signing Flow

There are TWO separate Apple credentials involved:

| Purpose                                  | File Type |
| ---------------------------------------- | --------- |
| Code signing certificate                 | `.p12`    |
| App Store Connect API key (notarization) | `.p8`     |

These are different things.

---

# Part 1 — Create Developer ID Application Certificate

## Open Apple Developer Certificates

Go to:

[https://developer.apple.com/account/resources/certificates/list](https://developer.apple.com/account/resources/certificates/list)

Click:

## +

(Create Certificate)

---

## Select Certificate Type

Choose:

# ✅ Developer ID Application

Do NOT choose:

* Apple Development
* Mac App Distribution
* Developer ID Installer

Developer ID Application is specifically for:

* Electron apps
* apps distributed outside Mac App Store

---

# Part 2 — Generate CSR File

Apple requires a CSR (Certificate Signing Request).

## Open Keychain Access

Open:

```text
Keychain Access
```

IMPORTANT:

Select:

# ✅ login keychain

NOT iCloud.

Using iCloud can break signing identities.

---

## Generate CSR

In macOS menu bar:

```text
Keychain Access
→ Certificate Assistant
→ Request a Certificate From a Certificate Authority…
```

Fill in:

| Field              | Value                    |
| ------------------ | ------------------------ |
| User Email Address | Apple Developer email    |
| Common Name        | `Your Name Developer ID` |
| CA Email Address   | Leave blank              |
| Request is         | ✅ Saved to disk          |

Save the CSR somewhere easy like Desktop.

Example:

```text
CertificateSigningRequest.certSigningRequest
```

---

# Part 3 — Create Certificate

Back on Apple Developer:

1. Choose:

   ```text
   G2 Sub-CA (Xcode 11.4.1 or later)
   ```
2. Upload CSR
3. Continue
4. Download `.cer`

Example:

```text
developerID_application.cer
```

---

# Part 4 — Install Certificate

Double-click the downloaded `.cer`.

Then open:

```text
Keychain Access → My Certificates
```

You should see:

```text
Developer ID Application: Your Name (TEAM_ID)
```

with:

```text
▼ private key
```

underneath it.

This means the signing identity is valid.

---

# Verify Signing Identity

Run:

```bash
security find-identity -v -p codesigning
```

You should see:

```text
Developer ID Application: Your Name (TEAM_ID)
```

If you see:

```text
0 valid identities found
```

install Apple intermediate certificate:

[https://www.apple.com/certificateauthority/](https://www.apple.com/certificateauthority/)

Download:

```text
Developer ID - G2
```

Install it.

---

# Part 5 — Create App Store Connect API Key

This is required for notarization.

Go to:

[https://appstoreconnect.apple.com](https://appstoreconnect.apple.com)

Navigate to:

```text
Users and Access
→ Integrations
→ App Store Connect API
```

If prompted:

* request API access
* approve terms

---

## Generate API Key

Click:

```text
+
```

Fill in:

| Field  | Value                 |
| ------ | --------------------- |
| Name   | Electron Notarization |
| Access | Admin                 |

Generate key.

---

# IMPORTANT — Download `.p8` Immediately

Apple only allows downloading the `.p8` ONCE.

Example:

```text
AuthKey_XXXXXXXXXX.p8
```

Save it securely.

---

# Values You Need

You now have:

| Variable         | Source          |
| ---------------- | --------------- |
| APPLE_TEAM_ID    | Apple Developer |
| APPLE_API_KEY_ID | API key page    |
| APPLE_API_ISSUER | API page        |
| APPLE_API_KEY    | `.p8` contents  |

---

# Example `.env.signing`

```env
APPLE_TEAM_ID=GQHD6J4H7G
APPLE_API_KEY_ID=XXXXXXXXXX
APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
APPLE_API_KEY=/Users/yourname/.private_keys/AuthKey_XXXXXXXXXX.p8
```

IMPORTANT:

`APPLE_API_KEY` is:

* local filesystem path
* NOT the contents

for local development.

---

# Part 6 — Export `.p12` Certificate

GitHub Actions cannot access your Mac keychain.

You must export the certificate.

## Export from Keychain

Open:

```text
Keychain Access → My Certificates
```

Right-click:

```text
Developer ID Application: Your Name
```

Choose:

```text
Export
```

Save as:

```text
developer_id_application.p12
```

Choose a password.

You will need this later.

---

# Part 7 — Base64 Encode `.p12`

GitHub Secrets cannot store binary files directly.

Convert to base64.

Run:

```bash
base64 -i ~/Desktop/developer_id_application.p12 | pbcopy
```

This copies the encoded certificate to clipboard.

---

# Part 8 — Configure GitHub Secrets

Go to:

```text
GitHub Repo
→ Settings
→ Secrets and Variables
→ Actions
```

Use:

# ✅ Repository Secrets

NOT Environment Secrets.

---

# Required GitHub Secrets

| Secret                       | Value                    |
| ---------------------------- | ------------------------ |
| `MAC_CERTIFICATE_P12_BASE64` | base64 output of `.p12`  |
| `MAC_CERTIFICATE_PASSWORD`   | `.p12` password          |
| `APPLE_TEAM_ID`              | Team ID                  |
| `APPLE_API_KEY_ID`           | API Key ID               |
| `APPLE_API_ISSUER`           | Issuer ID                |
| `APPLE_API_KEY`              | FULL `.p8` file contents |

---

# Important — APPLE_API_KEY Secret

In GitHub Secrets:

```text
APPLE_API_KEY
```

must contain the ENTIRE `.p8` contents.

NOT the file path.

Get contents with:

```bash
cat /Users/yourname/.private_keys/AuthKey_XXXXXXXXXX.p8 | pbcopy
```

Paste into GitHub secret.

---

# Example CI Signing Flow

Typical CI process:

1. Restore `.p12`
2. Import certificate into temporary keychain
3. Restore `.p8`
4. Build Electron app
5. Code sign app
6. Notarize with Apple
7. Staple notarization ticket
8. Upload signed `.dmg` / `.zip`

---

# Common Problems

---

## Error: "Unable to import certificate"

Usually caused by:

* CSR generated in iCloud keychain
* mismatched private key

Fix:

* use `login` keychain
* regenerate CSR

---

## Error: "0 valid identities found"

Usually missing:

* Apple intermediate certificate

Install:

* Developer ID - G2 certificate

---

## Error: "App is damaged and can't be opened"

Usually:

* app not notarized
* notarization failed
* ticket not stapled

---

## Error: "Apple cannot verify app"

Usually:

* signed but not notarized

---

# Recommended File Storage

Suggested local structure:

```text
~/.private_keys/
├── AuthKey_XXXXXXXXXX.p8
```

and temporary exports:

```text
~/Desktop/developer_id_application.p12
```

---

# Security Notes

Never commit:

* `.p12`
* `.p8`
* `.env.signing`

to git.

Add to `.gitignore`:

```gitignore
*.p12
*.p8
.env.signing
```

---

# Final Verification Commands

Verify signing identities:

```bash
security find-identity -v -p codesigning
```

Verify app signing:

```bash
codesign --verify --deep --strict --verbose=2 path/to/App.app
```

Check notarization:

```bash
spctl -a -vvv path/to/App.app
```

---

# Final Result

After completing this setup:

✅ Electron app signs successfully
✅ GitHub Actions can sign builds
✅ Apple notarization works
✅ macOS Gatekeeper accepts app
✅ DMG/ZIP distributions are trusted
