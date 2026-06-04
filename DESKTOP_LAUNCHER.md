# AURIX Core - Desktop Launcher Setup (Windows)

Quick guide to set up and run AURIX Core from your desktop.

## Files

- **`start-aurix-core.bat`** — Main launcher script (double-click to start)
- **`start-aurix-core.ps1`** — PowerShell alternative (modern, colorful)
- **`create-desktop-shortcut.ps1`** — Automatic shortcut creation

## Quick Start (3 Steps)

### Step 1: Create Desktop Shortcut

**Using PowerShell (Recommended):**
1. Open PowerShell (press `Win + X` → PowerShell)
2. Navigate to repository root:
   ```powershell
   cd "C:\Users\[YourUsername]\Desktop\Dan\VS Code\Evidence výdajů"
   ```
3. Run shortcut creation:
   ```powershell
   .\create-desktop-shortcut.ps1
   ```
4. Accept any prompts (may ask for admin approval)

**Result:** `AURIX Core.lnk` appears on your desktop

---

### Step 2: Test the Shortcut

1. **Double-click** `AURIX Core` on your desktop
2. A Command Prompt window opens
3. Script checks Node.js and dependencies
4. First run installs npm packages (~2-3 min)
5. Dev server starts at http://localhost:5173
6. Electron window opens with AURIX Core

---

### Step 3: Done! 🎉

Next time, just double-click `AURIX Core` to start the app.

---

## Manual Setup (If PowerShell Fails)

If `create-desktop-shortcut.ps1` doesn't work:

1. Right-click `start-aurix-core.bat` → **Create shortcut**
2. Rename shortcut to `AURIX Core`
3. Move to Desktop
4. Done!

---

## Customizing the Shortcut

### Change Icon

1. Right-click `AURIX Core` shortcut → **Properties**
2. Click **Change Icon...**
3. Browse to an icon file (.ico) or select from system icons
4. Click **OK**

Example icon locations (for future builds):
- `desktop-app/public/icon.ico`
- `desktop-app/public/icon.png` (will need conversion)

### Set Admin Privileges (Optional)

If app needs admin rights:
1. Right-click shortcut → **Properties**
2. Click **Advanced...**
3. Check **Run as administrator**
4. Click **OK**

---

## Troubleshooting

### "Node.js not found"
- Install Node.js from https://nodejs.org/
- Restart your computer after installation
- Try again

### "Desktop-app folder not found"
- Make sure you run the script from the repository **root** folder
- Not from inside `desktop-app/`
- Correct path: `C:\Users\[You]\Desktop\Dan\VS Code\Evidence výdajů\`

### Shortcut doesn't work
- Check you're running PowerShell script from correct folder
- Try running as Administrator: Right-click PowerShell → Run as admin
- Verify `start-aurix-core.bat` exists in the root folder

### Electron window is blank
- Check Vite is running (terminal shows "http://localhost:5173")
- Wait 5-10 seconds for app to load
- Check browser console (Ctrl+Shift+I) for errors

### npm packages won't install
- Check internet connection
- Try deleting `desktop-app/node_modules/` and running again
- Run as Administrator

---

## What Happens When You Click the Shortcut

1. **Batch script runs** (`start-aurix-core.bat`)
2. **Node.js check** — Verifies Node is installed
3. **Directory check** — Confirms `desktop-app/` exists
4. **Dependencies** — Runs `npm install` (only if first time)
5. **Start dev server** — Runs `npm run dev`
6. **Electron opens** — App window appears with full UI

All of this happens automatically - no manual steps needed!

---

## Environment Variables & Security

✅ **Safe & Secure:**
- Batch script contains NO secrets, tokens, or API keys
- All configuration comes from `.env.local` (which is git-ignored)
- Shortcut only launches the app locally
- No data is transmitted outside your computer during development

**Important:** Before deploying to production:
- Don't commit `.env.local` (keep it git-ignored)
- Store Firebase credentials securely in GitHub Secrets
- Use Cloud Functions as intermediary for sensitive operations

---

## Uninstalling

To remove AURIX Core:
1. Delete `AURIX Core` shortcut from Desktop
2. (Optional) Delete `start-aurix-core.bat`, `.ps1` files from repository
3. (Optional) Delete `desktop-app/node_modules/` to free disk space

---

## Upgrading (Later)

When you pull new changes from git:
```bash
git pull
```

The script automatically updates dependencies, so no manual `npm install` needed.

---

## Future: Production Installer

This MVP setup is for **development**. For production distribution, we'll create:
- Windows installer via Electron Builder
- Auto-update support
- Proper code signing
- Proper icon packaging

For now, this desktop launcher gets AURIX Core running locally! 🚀
