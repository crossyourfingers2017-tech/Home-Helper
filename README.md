# Home Helper V2

This version adds:
- Firebase Email/Password family login
- Shared Firestore data between phones
- Live syncing
- Rooms, family members, chores, approval and rewards
- Backup/export and restore/import

## Firebase setup required

### 1. Enable Email/Password Authentication
Firebase Console → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.

### 2. Create Firestore
Firebase Console → Firestore Database → Create database → Production mode.
Choose a nearby European location if prompted.

### 3. Paste the Firestore rules
Open Firestore Database → Rules and replace the rules with the contents of `firestore.rules`, then Publish.

### 4. Upload app files to GitHub
Replace the existing Home-Helper repository files with:
- index.html
- app.js
- styles.css
- manifest.webmanifest
- sw.js

`firestore.rules` is for Firebase only; it does not need to be uploaded to GitHub.

## Family login
Create ONE family account from the app. Use that same email/password on each family phone.
