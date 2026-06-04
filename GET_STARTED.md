# 🚀 Get Started with AURIX Core

Welcome! Follow this guide to set up and run AURIX Core on your Windows machine.

---

## 📋 What is AURIX Core?

AURIX Core is a **desktop application** (Electron + React) for managing:
- 📊 ML dashboards and analytics
- 🤖 Model control (activation, rollback, shadow mode)
- 👥 User and role management
- 📝 Admin audit trail

---

## ⏱️ Total Setup Time: ~30-45 minutes

---

## Quick Navigation

| Guide | Time | What |
|-------|------|------|
| [Installation Checklist](#installation-checklist) | 30-45 min | Full step-by-step setup |
| [Quick Setup](./QUICK_SETUP.md) | 5 min | Just run the app |
| [Firebase Setup](./FIREBASE_SETUP.md) | 10-15 min | Configure Firebase |
| [Desktop Launcher](./DESKTOP_LAUNCHER.md) | 2 min | Create shortcut |

---

## Installation Checklist

### ✅ Phase 1: Prerequisites (5 min)

**Check if Node.js is installed:**
```bash
node --version
```

**If not installed:**
- Download from https://nodejs.org/ (v18 or newer)
- Install and restart your computer

---

### ✅ Phase 2: NPM Install (2-3 min)

Open Command Prompt or PowerShell:

```bash
cd "C:\Users\[YourUsername]\Desktop\Dan\VS Code\Evidence výdajů\desktop-app"
npm install
```

Wait for completion. Should show: `added XXX packages`

---

### ✅ Phase 3: Firebase Setup (10-15 min)

Follow detailed guide: **[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)**

Quick summary:
1. Go to https://console.firebase.google.com/
2. Create new project: `evidence-vydaju`
3. Enable Authentication (Email/Password + Google)
4. Create Firestore Database (test mode)
5. Copy Firebase config (6 values)
6. Update `desktop-app/src/config/firebase.ts` with your config
7. Create 7 Firestore collections (empty is fine)
8. Update temporary Firestore rules
9. Create test user: `test@example.com` / `Test123!`

**Detailed instructions in [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)**

---

### ✅ Phase 4: Create Desktop Shortcut (2 min)

Open PowerShell in repository root:

```powershell
.\create-desktop-shortcut.ps1
```

You'll see `AURIX Core` shortcut on your desktop.

---

### ✅ Phase 5: First Run (1 min)

**Double-click** `AURIX Core` on your desktop

What happens:
1. Command window opens
2. Script checks Node.js
3. Installs dependencies (first time only, ~2-3 min)
4. Starts dev server
5. Electron window opens

---

### ✅ Phase 6: Test Login (1 min)

When Electron window opens:
- Email: `test@example.com`
- Password: `Test123!`
- Or use Google Sign-in

You should see the **Dashboard** ✅

---

## 🎉 Success! You're All Set

### What You Can Do Now:

- ✅ View dashboards with live Firestore data
- ✅ Navigate between pages (sidebar menu)
- ✅ Test authentication
- ✅ Edit React code (`desktop-app/src/`) - changes reload automatically
- ✅ Inspect with DevTools (Ctrl+Shift+I)

---

## 📚 Full Guides

For detailed step-by-step instructions, see:

1. **[INSTALLATION_CHECKLIST.md](./INSTALLATION_CHECKLIST.md)** — Complete checklist format
2. **[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)** — Detailed Firebase configuration
3. **[QUICK_SETUP.md](./QUICK_SETUP.md)** — Quick start guide
4. **[DESKTOP_LAUNCHER.md](./DESKTOP_LAUNCHER.md)** — Launcher and shortcut details
5. **[desktop-app/README.md](./desktop-app/README.md)** — Development guide

---

## 🆘 Common Issues

### "Node.js not found"
- Install from https://nodejs.org/
- Restart computer
- Try again

### "npm packages won't install"
- Delete `desktop-app/node_modules/`
- Try again: `npm install`
- Or use: `npm install --legacy-peer-deps`

### "Firebase config error"
- Check `desktop-app/src/config/firebase.ts`
- Verify all 6 values from Firebase Console
- Save file
- Reload app (Ctrl+R)

### "Can't login"
- Check test user exists in Firebase > Authentication
- Verify Firestore rules allow authenticated access
- Check browser console (F12) for errors

### "Electron window blank"
- Wait 10 seconds for Vite to compile
- Check browser console (F12)
- Try Ctrl+R to reload

---

## 🔐 Security Notes

**Your Firebase credentials:**
- ✅ Stored in `desktop-app/src/config/firebase.ts`
- ⚠️ Don't commit this file to git (it's in `.gitignore`)
- ✅ Safe for development (test mode rules)
- ⚠️ Before production: implement proper security rules

**Shortcut is safe:**
- ✅ Contains no secrets
- ✅ No passwords in launcher script
- ✅ Only starts the app locally

---

## 🚀 Next Steps After Setup

### For Development:
1. Read `desktop-app/README.md` for architecture
2. Edit React components in `desktop-app/src/`
3. Changes reload automatically (HMR)
4. Use DevTools for debugging (F12)

### To Deploy Backend (Later):
1. Follow `CLOUD_FUNCTIONS.md` to deploy Cloud Functions
2. Set up proper Firestore security rules
3. Configure ML pipeline (Python)
4. Create production Windows installer

---

## 📞 Help & Support

- 📖 Check guides above for step-by-step help
- 🔍 Open browser console (F12) to see error messages
- 💻 Check `desktop-app/README.md` for development help
- 🐛 Check `FIREBASE_SETUP.md` for Firebase issues

---

## ✅ Ready to Start?

**Click here to begin:**

1. **Phase 1:** Check Node.js is installed
2. **Phase 2:** Run `npm install` in terminal
3. **Phase 3:** Follow [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)
4. **Phase 4:** Run `.\create-desktop-shortcut.ps1`
5. **Phase 5:** Double-click `AURIX Core` shortcut
6. **Phase 6:** Login and explore! 🎉

---

**Total time: ~30-45 minutes**

**Enjoy AURIX Core! 🚀**
