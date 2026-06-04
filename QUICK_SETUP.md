# AURIX Core - Quick Setup Guide (5 Minutes)

Get AURIX Core running on your Windows desktop in 5 easy steps.

---

## ⚡ Super Quick (30 seconds if Node.js already installed)

1. **Clone/extract** the repository
2. **Open** File Explorer, navigate to repository root
3. **Double-click** `start-aurix-core.bat`
4. **Wait** for dependencies to install (first time only)
5. **Electron app** opens automatically ✅

---

## 📋 Detailed Setup (Step-by-Step)

### Step 1: Install Node.js (5 min)

Check if you have Node.js:
- Press `Win + R`, type `cmd`, press Enter
- Type `node --version`
- If it shows a version number (e.g., `v18.0.0`), skip to Step 2
- If not, download and install from https://nodejs.org/

After installing Node.js, **restart your computer**.

---

### Step 2: Clone Repository (2 min)

If you haven't already:
```bash
git clone https://github.com/[your-repo]/Evidence-v-daj-
cd Evidence-v-daj-
```

Or if you already have it, just open the folder.

---

### Step 3: Run Desktop Launcher (1 min)

**Option A: Automatic Shortcut (Recommended)**

1. Press `Win + X` → **PowerShell**
2. Navigate to repository:
   ```powershell
   cd "C:\Path\To\Evidence-v-daj-"
   ```
3. Create desktop shortcut:
   ```powershell
   .\create-desktop-shortcut.ps1
   ```
4. You'll see: `AURIX Core` appears on your desktop

**Option B: Manual Launcher**

1. Navigate to repository in File Explorer
2. Double-click `start-aurix-core.bat`
3. Command window opens, app starts

---

### Step 4: Configure Firebase (2 min)

Edit `desktop-app/src/config/firebase.ts`:

Replace placeholder credentials with your Firebase project keys:
```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcd1234...",
}
```

**Don't have Firebase credentials?**
- Go to https://firebase.google.com
- Create a new project
- Copy credentials from Project Settings

---

### Step 5: Start AURIX Core! (Immediate)

**Using Desktop Shortcut:**
- Double-click `AURIX Core` on your desktop ✅

**Or manually:**
1. Open Command Prompt (press `Win + R`, type `cmd`)
2. Navigate to repo root
3. Type:
   ```bash
   start-aurix-core.bat
   ```

**What happens:**
1. Script checks Node.js
2. Installs npm packages (first run only, ~2-3 min)
3. Starts development server
4. **Electron window opens** with AURIX Core app 🎉

---

## ✅ You're Done!

AURIX Core is running. You can now:
- 👤 Log in with email/password or Google
- 📊 View dashboards
- 🤖 Control ML models
- 👥 Manage users & roles
- ⚙️ Configure settings

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Node.js not found" | Install from nodejs.org, restart computer |
| "Module not found" | Delete `desktop-app/node_modules`, run script again |
| Blank Electron window | Wait 10 sec, check browser console (F12) |
| Can't create shortcut | Run PowerShell **as Administrator** |
| Script won't execute | Right-click → "Run with PowerShell" |

---

## 📚 Full Documentation

For more details, see:
- **DESKTOP_LAUNCHER.md** — Desktop launcher setup guide
- **desktop-app/README.md** — AURIX Core development guide
- **CLOUD_FUNCTIONS.md** — Backend function specs
- **ML_PIPELINE_INTEGRATION.md** — ML pipeline setup

---

## 🚀 Next Steps

### For Development:
1. Read **desktop-app/README.md** for architecture
2. Edit files in `desktop-app/src/`
3. Changes reload automatically (HMR)

### For Production (Later):
1. Deploy Cloud Functions
2. Configure real Firebase project
3. Set up ML pipeline (Python)
4. Create Windows installer via Electron Builder

---

## 💡 Tips

- **Ctrl+Shift+I** in AURIX Core to open DevTools
- **Ctrl+R** to reload app
- Check **desktop-app/README.md** for all npm commands
- Keep `.env.local` with Firebase credentials (don't commit!)

---

**Questions?** Check the documentation files or GitHub Issues.

**Ready to start?** Double-click `AURIX Core` on your desktop! 🎉
