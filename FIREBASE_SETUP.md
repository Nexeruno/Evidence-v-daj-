# Firebase Setup Guide for AURIX Core

Complete step-by-step guide to configure Firebase for AURIX Core development.

---

## ⏱️ Time Required: 10-15 minutes

---

## Step 1: Create Firebase Project

### 1.1 Go to Firebase Console
- Open https://console.firebase.google.com/
- Click **"Add project"**

### 1.2 Enter Project Details
- **Project name:** `evidence-vydaju` (or your preferred name)
- **Analytics:** Uncheck "Enable Google Analytics for this project" (optional for MVP)
- Click **"Create project"**

Wait 1-2 minutes for project creation...

---

## Step 2: Enable Authentication

### 2.1 Go to Authentication
- In Firebase Console, click **"Authentication"** (left sidebar)
- Click **"Get started"**

### 2.2 Enable Sign-in Methods

#### Email/Password (Required)
1. Click **Email/Password** provider
2. Enable **Email/password**
3. Click **Save**

#### Google Sign-in (Recommended)
1. Click **Google** provider
2. Enable **Google**
3. Enter project name & support email
4. Click **Save**

### 2.3 Enable Emulator (Development Only)
- In Authentication tab, click **Emulator tab**
- Click **Start emulator** (optional, for local testing)

---

## Step 3: Create Firestore Database

### 3.1 Go to Firestore
- Click **"Firestore Database"** (left sidebar)
- Click **"Create database"**

### 3.2 Configure Database
- **Location:** Select region close to you (e.g., Europe-west1)
- **Rules:** Choose **"Start in test mode"** (temporary, will secure later)
- Click **"Create"**

Wait 1-2 minutes for database creation...

---

## Step 4: Get Firebase Configuration

### 4.1 Go to Project Settings
- Click ⚙️ **Settings icon** (top-right)
- Click **"Project settings"**

### 4.2 Copy Credentials
Scroll to **"Your apps"** section:

Look for **Web app** (marked with `</>`):
- If none exists, click **"Add app"** and select **"Web"**
- Enter app nickname: `AURIX Core`
- Click **"Register app"**

You'll see Firebase config:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

**Copy all 6 values** (you'll need them next)

---

## Step 5: Update AURIX Core Configuration

### 5.1 Edit firebase.ts

Open: `desktop-app/src/config/firebase.ts`

Replace placeholder values with your Firebase config:

```typescript
const firebaseConfig = {
  apiKey: 'YOUR_API_KEY_FROM_FIREBASE',              // Copy from Firebase
  authDomain: 'YOUR_AUTH_DOMAIN_FROM_FIREBASE',      // e.g., "evidence-vydaju.firebaseapp.com"
  projectId: 'YOUR_PROJECT_ID_FROM_FIREBASE',        // e.g., "evidence-vydaju"
  storageBucket: 'YOUR_STORAGE_BUCKET_FROM_FIREBASE', // e.g., "evidence-vydaju.appspot.com"
  messagingSenderId: 'YOUR_MESSAGING_SENDER_ID',     // Copy from Firebase
  appId: 'YOUR_APP_ID_FROM_FIREBASE',                // Copy from Firebase
}
```

**Example (yours will be different):**
```typescript
const firebaseConfig = {
  apiKey: 'AIzaSyB1234567890abcdefghijklmnopqrst',
  authDomain: 'evidence-vydaju.firebaseapp.com',
  projectId: 'evidence-vydaju',
  storageBucket: 'evidence-vydaju.appspot.com',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:abcdef1234567890ab',
}
```

**Save the file**

### 5.2 Verify Emulator Settings (Optional)

The file includes development emulator config:
```typescript
// Emulator setup (dev only)
const isDev = process.env.NODE_ENV === 'development'
if (isDev && window.location.hostname === 'localhost') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
    connectFirestoreEmulator(db, 'localhost', 8080)
  } catch (err) {
    // Emulator already connected
  }
}
```

This is optional for MVP - leave as is.

---

## Step 6: Create Initial Firestore Collections

### 6.1 Go to Firestore
- Click **"Firestore Database"** (left sidebar)

### 6.2 Create Collections

Click **"+ Start collection"** and create these (use exact names):

#### Collection 1: `users`
- Collection ID: `users`
- Auto ID: Yes
- Leave empty for now

#### Collection 2: `mlMetrics`
- Collection ID: `mlMetrics`
- Auto ID: Yes
- Leave empty for now

#### Collection 3: `mlRuns`
- Collection ID: `mlRuns`
- Auto ID: Yes
- Leave empty for now

#### Collection 4: `mlPredictions`
- Collection ID: `mlPredictions`
- Auto ID: Yes
- Leave empty for now

#### Collection 5: `mlTrainingData`
- Collection ID: `mlTrainingData`
- Auto ID: Yes
- Leave empty for now

#### Collection 6: `userSessions`
- Collection ID: `userSessions`
- Auto ID: Yes
- Leave empty for now

#### Collection 7: `auditTrail`
- Collection ID: `auditTrail`
- Auto ID: Yes
- Leave empty for now

---

## Step 7: Set Up Firestore Security Rules (Development)

### 7.1 Go to Firestore Rules
- In Firestore tab, click **"Rules"** (next to "Data")

### 7.2 Update Rules (Temporary for MVP)

Replace with:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow authenticated users to read/write all collections (DEVELOPMENT ONLY)
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Click **"Publish"**

⚠️ **Warning:** These are development rules. Before production, implement proper security rules per `CLOUD_FUNCTIONS.md`.

---

## Step 8: Create Test User (Optional but Recommended)

### 8.1 Go to Authentication
- Click **"Authentication"** (left sidebar)
- Click **"Users"** tab

### 8.2 Add Test User
- Click **"+ Create user"**
- Email: `test@example.com`
- Password: `Test123!` (secure password)
- Click **"Create user"**

This user can be used to test login.

---

## Step 9: Install Dependencies & Run App

### 9.1 Install npm packages
```bash
cd desktop-app
npm install
```

Wait for installation to complete (~2-3 minutes)

### 9.2 Start AURIX Core
```bash
npm run dev
```

Or double-click `start-aurix-core.bat`

### 9.3 Test Login
- App opens with login screen
- Try signing in with:
  - **Email:** `test@example.com`
  - **Password:** `Test123!`
  - Or use **Google Sign-in**

If successful, you'll see the dashboard! ✅

---

## ✅ Firebase Setup Complete!

Your AURIX Core is now connected to Firebase.

### What's Ready:
- ✅ Firebase Authentication (Email + Google)
- ✅ Firestore Database
- ✅ Development security rules
- ✅ Local emulator support (optional)
- ✅ 7 initial collections

---

## 🔐 Security Notes

### Current Setup (Development)
- **Anyone with app config** can read/write to Firestore
- **This is fine for development** but NOT production
- Emulator rules are even more permissive (good for testing)

### Before Production
1. Implement proper Firestore security rules (see `CLOUD_FUNCTIONS.md`)
2. Set up admin-only access via custom claims
3. Enable Cloud Functions for sensitive operations
4. Use environment variables instead of hardcoded config
5. Enable HTTPS only, disable emulator

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Cannot find module firebase" | Run `npm install` in `desktop-app/` |
| "FIREBASE_API_KEY not set" | Check you edited `firebase.ts` with correct values |
| "Permission denied" reading Firestore | Check Firestore rules allow authenticated access |
| "Auth emulator failed to connect" | Leave emulator disabled for MVP |
| Can't sign in | Check Email/Password is enabled in Firebase Console |

---

## 📚 Next Steps

### For Development:
1. Data will auto-sync from Firestore to AURIX Core
2. Check browser console (F12) for errors
3. Use Firestore Console to add test data

### For Production (Later):
1. Deploy Cloud Functions (see `CLOUD_FUNCTIONS.md`)
2. Implement proper security rules
3. Set up custom claims for role-based access
4. Configure Cloud Function environment variables
5. Set up audit logging

---

## 🎉 Done!

AURIX Core is now connected to Firebase and ready for development!

**Next:** Follow `QUICK_SETUP.md` to create desktop shortcut and start developing.
