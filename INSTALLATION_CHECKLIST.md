# AURIX Core Installation Checklist

Complete checklist to get AURIX Core running locally with Firebase.

---

## Phase 1: Prerequisites ✅

- [ ] **Node.js 18+** installed
  - Check: Open CMD, type `node --version`
  - If not: Download from https://nodejs.org/

- [ ] **Repository cloned** or extracted
  - Path: `C:\Users\[You]\Desktop\Dan\VS Code\Evidence výdajů\`

- [ ] **VS Code** (optional but recommended)
  - Download from https://code.visualstudio.com/

---

## Phase 2: NPM Install (2-3 minutes)

- [ ] Open **Command Prompt** or **PowerShell**
  
- [ ] Navigate to desktop-app folder:
  ```bash
  cd "C:\Users\[You]\Desktop\Dan\VS Code\Evidence výdajů\desktop-app"
  ```

- [ ] Install dependencies:
  ```bash
  npm install
  ```
  
- [ ] Wait for installation to complete
  - Should see: `added XXX packages`
  - If errors, try: `npm install --legacy-peer-deps`

---

## Phase 3: Firebase Setup (10-15 minutes)

Follow **[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)**:

- [ ] Create Firebase project at https://console.firebase.google.com/
  
- [ ] Enable **Authentication**
  - [ ] Email/Password
  - [ ] Google Sign-in

- [ ] Create **Firestore Database**
  - [ ] Start in test mode
  - [ ] Select your region

- [ ] Copy **Firebase Config** (6 values: apiKey, authDomain, projectId, etc.)

- [ ] Update `desktop-app/src/config/firebase.ts`
  - [ ] Replace all placeholder values with your Firebase config
  - [ ] Save file

- [ ] Create **7 Firestore collections**:
  - [ ] `users`
  - [ ] `mlMetrics`
  - [ ] `mlRuns`
  - [ ] `mlPredictions`
  - [ ] `mlTrainingData`
  - [ ] `userSessions`
  - [ ] `auditTrail`

- [ ] Update **Firestore Rules** (temporary dev rules)
  - Copy rules from `FIREBASE_SETUP.md` step 7.2
  - Publish rules

- [ ] Create **test user** (optional)
  - Email: `test@example.com`
  - Password: `Test123!`

---

## Phase 4: Desktop Launcher Setup (2 minutes)

Follow **[QUICK_SETUP.md](./QUICK_SETUP.md)**:

- [ ] Create desktop shortcut:
  ```powershell
  .\create-desktop-shortcut.ps1
  ```

- [ ] Check **`AURIX Core`** shortcut appears on desktop

---

## Phase 5: First Run Test (1 minute)

- [ ] **Double-click** `AURIX Core` shortcut on desktop

- [ ] Watch for:
  - [ ] Command window opens
  - [ ] Script checks Node.js
  - [ ] Shows "Installing dependencies..." (first time only)
  - [ ] Shows "Starting AURIX Core..."
  - [ ] Electron window opens with login screen

- [ ] **Test login:**
  - [ ] Try email login: `test@example.com` / `Test123!`
  - [ ] Or use Google Sign-in
  - [ ] Should see Dashboard after login ✅

---

## Phase 6: Verify Everything Works

- [ ] **Dashboard loads** with app shell
- [ ] **Sidebar navigation** visible
- [ ] **User menu** shows email in top-right
- [ ] **Can click pages** (ML Dashboard, Users, etc.)
- [ ] **Browser console clean** (Ctrl+Shift+I) - no major errors

---

## 🎉 Installation Complete!

AURIX Core is ready for development!

---

## Next Steps

### For Development:
- Read **desktop-app/README.md** for architecture
- Edit files in `desktop-app/src/`
- Changes reload automatically

### For Production (Later):
- Follow **CLOUD_FUNCTIONS.md** to deploy backend
- Implement proper Firestore security rules
- Set up ML pipeline (Python)
- Create Windows installer

---

## 🆘 If Something Breaks

### "Module not found"
```bash
cd desktop-app
rm -r node_modules
npm install
```

### "Firebase config error"
- Double-check `src/config/firebase.ts` has 6 values
- Don't forget quotes around string values
- Save file after editing

### "Electron window blank"
- Wait 10 seconds for Vite to compile
- Check browser console (F12) for errors
- Try Ctrl+R to reload

### "Can't login"
- Verify test user exists in Firebase Console > Authentication > Users
- Check email/password is correct
- Check Firestore rules allow authenticated access

---

## 📞 Support

1. Check **QUICK_SETUP.md** for common issues
2. Check **FIREBASE_SETUP.md** for Firebase problems
3. Check **desktop-app/README.md** for dev issues
4. Check browser console (F12) for error messages

---

## ⏱️ Total Time: ~30-45 minutes

- Prerequisites: 5 min
- npm install: 2-3 min
- Firebase setup: 10-15 min
- Desktop launcher: 2 min
- First run: 5 min
- Troubleshooting: 5-10 min (if needed)

**You're all set! 🚀**
