# Home Helper V3

This version changes Home Helper to individual family accounts with simple name + 6-digit PIN login.

## Included
- Pick your name, then enter a 6-digit PIN
- Adult and child roles
- Adults can see separate job lists for every family member
- Separate Completed / Needs Approval area
- Children can add jobs for anyone in the family
- Children cannot delete or approve jobs
- Cleaning tasks and General tasks
- Requested-by name on every task
- Due date + optional due time
- Saved reminder preferences: when assigned, on due day, one hour before due time
- Adult reward approval and payment tracking
- Family code to link a new phone
- Rooms and family management
- One-time migration from the previous V2 shared-login app

## IMPORTANT: Firebase rules must be updated first
Open Firebase Console -> Firestore Database -> Rules.
Replace the current rules with the contents of `firestore.rules`.
Publish them BEFORE uploading V3 to GitHub.

## Upload to GitHub
Replace these existing files in the Home-Helper repo:
- index.html
- app.js
- styles.css
- manifest.webmanifest
- sw.js
- README.md

Do not upload firestore.rules to the website; it is only for the Firebase Rules screen.

## Existing V2 account
If V2 is still signed in on the same browser, V3 will show a one-time upgrade screen.
Enter the adult's display name and a new 6-digit PIN.

## New phones
1. Open Home Helper.
2. Tap "Use my family code".
3. Enter the 10-character family code.
4. Pick a family member's name.
5. Enter their 6-digit PIN.

## Notifications
V3 stores the due date/time and notification choices, but actual phone push delivery is intentionally not enabled yet.
The next stage will connect free Web Push / Firebase Cloud Messaging and a free scheduler.
