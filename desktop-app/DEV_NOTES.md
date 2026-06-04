# Development Notes for AURIX Core

Common warnings and messages you'll see during development.

---

## ✅ Expected Console Messages

### React Router Future Flag Warnings

```
⚠️ React Router will begin wrapping state updates in React.startTransition in v7.
You can use the v7_startTransition future flag to opt-in early.
```

**What it means:** React Router v6 is warning about changes coming in v7.

**Is it a problem?** No, app works fine. This warning appears in development only.

**Fix (Optional):** Can add future flags in `src/App.tsx` later.

---

### Firebase Emulator Connection Errors

```
Failed to load resource: net::ERR_CONNECTION_REFUSED
POST http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword
```

**What it means:** Firebase SDK is trying to connect to local Firebase Emulator on port 9099, but emulator is not running.

**Is it a problem?** No, app falls back to real Firebase automatically.

**Why?** Code in `src/config/firebase.ts` attempts to connect to emulator in development mode:
```typescript
if (isDev && window.location.hostname === 'localhost') {
  try {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  } catch (err) {
    // Emulator not available, using real Firebase
  }
}
```

**Options:**
- ✅ **Do nothing** — App uses real Firebase (easiest for MVP)
- 🔧 **Start Firebase Emulator** (optional, for offline testing):
  ```bash
  firebase emulators:start
  ```

---

### Missing favicon.ico

```
Failed to load resource: the server responded with a status of 404 (Not Found)
favicon.ico:1
```

**What it means:** Browser is looking for a favicon (website icon) but it's not found.

**Is it a problem?** No, purely cosmetic.

**Fix:** Create `public/favicon.ico` file (optional)

---

## 🟢 How to Verify Everything Works

### Login Test
1. Try signing in with test user:
   - Email: `test@example.com`
   - Password: `Test123!`

2. If login succeeds → **Everything is working! ✅**

3. If login fails → Check:
   - Firebase credentials in `src/config/firebase.ts`
   - Test user exists in Firebase Console
   - Firestore rules allow authenticated access

---

## 🔍 Debugging Tips

### Browser DevTools
- Press **F12** or **Ctrl+Shift+I**
- Check **Console** tab for errors
- Check **Network** tab to see Firebase API calls

### Main Process Logs
- Command window shows Node/Electron logs
- Check for errors there

### VS Code Debugging
- Open `desktop-app/` folder in VS Code
- Install "Debugger for Chrome" extension
- Set breakpoints and debug

---

## 🛠️ Common Development Workflow

### 1. Edit React Component
```
Edit file in desktop-app/src/
↓
Vite detects change
↓
App reloads automatically (HMR)
```

### 2. Edit Electron Main Process
```
Edit file in electron/
↓
App must be restarted (no auto-reload)
↓
Ctrl+C to stop, npm run dev to restart
```

### 3. Add New Page
1. Create `src/pages/MyPage.tsx`
2. Add route in `src/App.tsx`
3. Add menu item in `src/layout/Sidebar.tsx`
4. Saves auto-reload the app

### 4. Test Firebase Changes
1. Edit Firestore rules in Firebase Console
2. Changes apply immediately
3. App auto-syncs through listeners

---

## ⚠️ Known Limitations (MVP)

- No offline support (next phase)
- Emulator not required for MVP (using real Firebase)
- ML pipeline not integrated yet (requires Python setup)
- No Cloud Functions yet (requires backend deployment)
- No production build optimization yet

---

## 🐛 If Something Breaks

### App won't start
1. Check if Vite is running (terminal shows "VITE v5...")
2. Check if Electron is running (check Windows taskbar)
3. Try `Ctrl+C` to stop, then `npm run dev` again

### Blank Electron window
1. Wait 10 seconds for Vite to compile
2. Press `Ctrl+R` to reload
3. Check console (F12) for errors

### React state not updating
1. Check `useFirestore` hook is returning data
2. Check Firestore has data (look in Firebase Console)
3. Check browser console for errors

### Login doesn't work
1. Check test user exists in Firebase Console
2. Check credentials are correct in `src/config/firebase.ts`
3. Check Firestore rules allow read/write
4. Check browser console for error messages

---

## 📝 Code Style

- **TypeScript:** Strict mode enabled
- **React:** Functional components + hooks
- **Imports:** Use `@/` alias for src folder
- **Styles:** Tailwind CSS utility classes
- **Components:** PascalCase for components, camelCase for functions

---

## 🚀 Performance Notes

- Vite hot reload: ~500ms
- Firestore initial load: ~1-2s (with cache)
- Electron startup: ~2-3s

---

## 📚 Useful Commands

```bash
# Development
npm run dev          # Start with Vite + Electron

# Type checking
npm run type-check   # Verify TypeScript

# Linting
npm run lint         # Check code style

# Building (for production)
npm run build        # Build optimized version
```

---

## 🔐 Development Security

⚠️ Remember:
- `.env.local` contains Firebase credentials (git-ignored)
- Don't commit credentials
- Don't share `.env.local` file
- Don't hardcode secrets in code

---

## 📞 Getting Help

1. Check this file first (you might be here!)
2. Check browser console (F12) for error messages
3. Check `desktop-app/README.md` for dev guide
4. Check `FIREBASE_SETUP.md` if Firebase issues

---

**Happy developing! 🚀**
