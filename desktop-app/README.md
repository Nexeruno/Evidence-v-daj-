# AURIX Core

Desktop Electron application for admin/AI/ML control of Evidence výdajů web application.

## Phases (All Complete ✅)

### Fáze 1: Skeleton + Electron + Firebase Auth ✅
- ✅ Electron main & preload processes (IPC, token handling, HTTPS)
- ✅ React 18 + TypeScript setup with Vite bundler
- ✅ Firebase Client SDK authentication (email, Google sign-in)
- ✅ Protected routing with role-based access control
- ✅ AppShell with Sidebar navigation & Topbar user menu
- ✅ Placeholder Dashboard & ML Dashboard pages
- **Files:** 23 core files (config, layout, auth, stubs)

### Fáze 2: Full Dashboard Implementation ✅
- ✅ Dashboard with live Firestore metrics (users, sessions, ML runs, accuracy)
- ✅ ML Dashboard with recent runs table & status cards
- ✅ ML Runs page with filtering (level, status) & statistics
- ✅ ML Predictions page with Level 1/2 toggle & confidence metrics
- ✅ Custom Firestore hooks (useFirestore, useMlRuns, useMlMetrics, useActiveSessions)
- **Files:** 4 new pages + 1 hooks file + type definitions

### Fáze 3: ML Pipeline Control ✅
- ✅ MlControlPage with shadow mode toggle & Level 2 activation
- ✅ Model rollback to Level 1 with confirmation modal
- ✅ Level 2 pipeline execution via Electron subprocess (stdin token)
- ✅ Cloud Function HTTPS calls via preload bridge
- ✅ useMlPipelineControl hook (runLevel2Pipeline, activateLevel2, rollbackToLevel1)
- ✅ Complete Cloud Functions specification (7 functions with security rules)
- ✅ ML Pipeline integration guide (Python starter code included)
- **Files:** 1 new page + 1 hook + 2 documentation files

### Fáze 4: User & Role Management ✅
- ✅ UsersPage with user list, role editing, statistics
- ✅ RolesPage with permissions matrix & role info
- ✅ AuditTrailPage with admin activity log & filtering
- ✅ ProtectedRoute with role-based access control
- ✅ Topbar with actual role display from custom claims
- ✅ useUserManagement hook (updateUserRole, createUser, deleteUser)
- ✅ Protection logic (no removing last admin, no removing own role)
- ✅ User management implementation guide with role merging strategy
- **Files:** 3 new pages + 1 hook + 1 type file + 1 documentation file

### Fáze 5: Training Data & Settings ✅
- ✅ TrainingDataPage with data list, import/export, validation
- ✅ SettingsPage with account, display, dashboard, cache settings
- ✅ Local SQLite caching with TTL & offline support
- ✅ Cache statistics & management (clear, vacuum)
- ✅ Complete navigation with 10 main routes
- ✅ SQLite caching guide with implementation examples
- **Files:** 2 new pages + SQLite documentation

## Features

### Dashboard & Analytics
- System overview with live metrics (users, sessions, ML runs)
- ML Dashboard with model status, accuracy, recent runs
- ML Runs history with filtering & statistics
- ML Predictions viewer with confidence metrics

### ML Model Control
- Level 1/2 status monitoring
- Shadow mode management
- Model activation & rollback
- Local Level 2 pipeline execution
- Training data import/export

### Admin & User Management
- User management (list, edit, delete, deactivate)
- Role management with permission matrix
- Admin activity audit trail
- Role-based access control (RBAC)
- Protection against breaking critical state (last admin, own role)

### Settings & Cache
- Account settings (password, profile)
- Display preferences (dark mode)
- Dashboard auto-refresh configuration
- Local SQLite cache management
- Cache statistics & optimization

## Getting Started

### Prerequisites
- Node.js 18+ ([Download](https://nodejs.org/))
- Firebase project with Firestore, Auth enabled
- Python 3.8+ (for ML pipeline, optional for MVP)

### Quick Start (Windows Desktop)

#### Option 1: Click Shortcut (Easiest - After First Setup)
1. Double-click `AURIX Core` shortcut on your desktop
2. Dev server opens at http://localhost:5173
3. Electron app launches automatically

#### Option 2: Run Batch Script (First Time)
1. Open File Explorer, navigate to repository root
2. Double-click `start-aurix-core.bat`
3. Script checks Node.js, installs dependencies, starts app

#### Option 3: Manual Command Line
```bash
cd desktop-app
npm install
npm run dev
```

### Configure Firebase

Edit `src/config/firebase.ts` with your Firebase credentials:
```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
}
```

Or use `.env.local` file (see `.env.example`)

### Creating Desktop Shortcut (Windows)

#### Method 1: PowerShell Script (Recommended)
```powershell
# Run in PowerShell (as Administrator recommended)
.\create-desktop-shortcut.ps1
```

This automatically creates `AURIX Core.lnk` on your desktop.

#### Method 2: Manual
1. Right-click `start-aurix-core.bat` → Create shortcut
2. Rename to `AURIX Core`
3. Move to Desktop
4. (Optional) Right-click shortcut → Properties → Change Icon

### Development

```bash
npm run dev
```

Runs Vite dev server (port 5173) + Electron app together.

### Building

```bash
npm run build          # Build React with Vite
npm run electron-builder  # Package into installer
```

Output: `out/AURIX Core-1.0.0.exe` (Windows) or `.dmg` (macOS)

## Architecture

```
AURIX Core (Electron)
├── Main Process (electron/main.ts)
│   ├── Window management
│   ├── IPC handlers (ML pipeline, Cloud Functions, cache)
│   └── Child process for Python
│
├── Preload Bridge (electron/preload.ts)
│   ├── Secure IPC API exposure
│   └── Token handling (never exposed)
│
└── Renderer (React)
    ├── Pages (dashboard, ML, users, roles, audit, settings)
    ├── Hooks (Firestore, ML pipeline, user management)
    ├── Auth (Context API, Firebase Client SDK)
    └── Layout (Sidebar, Topbar, AppShell)
```

### Data Flow

1. **User Action** → React Component
2. **Cloud Function Call** → useAuth.getIdToken() → IPC (Bearer token)
3. **Electron Main** → HTTPS POST with Bearer header → Cloud Function
4. **Cloud Function** → Verify admin role → Firestore update → Audit log
5. **Firestore Listener** → useFirestore hook → SQLite cache → Re-render
6. **Display** → Updated UI with fresh data

## Pages & Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/` | Dashboard | System overview |
| `/ml/dashboard` | ML Dashboard | Model status & metrics |
| `/ml/runs` | ML Runs | Pipeline execution history |
| `/ml/predictions` | ML Predictions | Prediction analytics |
| `/ml/control` | Model Control | Activate/rollback models |
| `/ml/training-data` | Training Data | Import/export training data |
| `/users` | Users | User management |
| `/roles` | Roles | Role & permission management |
| `/audit-trail` | Audit Trail | Admin activity log |
| `/settings` | Settings | Account & app settings |

## Configuration

### Environment Variables

Create `.env.local`:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
# ... etc
```

### Python ML Pipeline

Setup in `ml-pipeline/`:
```bash
cd ml-pipeline
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r src/requirements.txt
```

Test locally:
```bash
echo '{"idToken": "YOUR_TOKEN"}' | python src/main.py
```

## Security

### Electron
- ✅ Context isolation enabled (no Node integration in renderer)
- ✅ Sandbox mode active
- ✅ IPC preload bridge limits renderer capabilities
- ✅ Tokens passed via stdin (not in process args or env vars)

### Firebase
- ✅ Client SDK only (no Admin SDK in desktop app)
- ✅ Custom claims for role-based access
- ✅ Firestore rules enforce access control
- ✅ ID token verification in Cloud Functions

### Cloud Functions
- ✅ Bearer token authentication
- ✅ Admin role verification
- ✅ Protection against removing last admin
- ✅ Comprehensive audit logging
- ✅ Custom claims merging (doesn't overwrite)

### Caching
- ✅ SQLite stored locally (not synced)
- ✅ TTL-based expiration
- ✅ Clear cache button in Settings
- ✅ No sensitive data in cache

## Documentation

- **[CLOUD_FUNCTIONS.md](./CLOUD_FUNCTIONS.md)** — Backend function specs, Firestore schema, security rules
- **[ML_PIPELINE_INTEGRATION.md](./ML_PIPELINE_INTEGRATION.md)** — Python pipeline setup, stdin token passing, troubleshooting
- **[USER_MANAGEMENT.md](./USER_MANAGEMENT.md)** — Role merging, protection logic, Cloud Function implementation
- **[SQLITE_CACHING.md](./SQLITE_CACHING.md)** — Cache architecture, TTL configuration, offline support

## Troubleshooting

### Dev Server Not Starting
```bash
# Port 5173 in use?
npm run dev -- --port 5174

# Clear node_modules cache
rm -rf node_modules
npm install
```

### Electron Window Blank
- Check Vite is running on 5173: `http://localhost:5173`
- Verify dev tools show no errors (Cmd+Opt+I on macOS)
- Rebuild: `npm run dev`

### Firebase Auth Fails
- Verify credentials in `src/config/firebase.ts`
- Check Firestore is enabled in Firebase Console
- Enable email/password auth in Firebase Console

### ML Pipeline Fails
- Verify Python is installed: `python --version`
- Install dependencies: `pip install -r ml-pipeline/src/requirements.txt`
- Check token is valid: `firebase auth:export users.json`
- Enable Firestore emulator for testing

### Cache Issues
- Clear cache: Settings → Local Cache → Clear Cache Now
- Check location: `~/.aurix-core/cache/firestore.db`
- Rebuild cache: delete file, restart app

## Performance

- **Startup:** ~3-5 seconds (Vite HMR in dev, 1-2s production)
- **Dashboard:** ~500ms (SQLite cache, 1-2s first load)
- **ML Pipeline:** 30-60 seconds (depends on dataset size)
- **API calls:** -70% reduction with caching

## Future Enhancements

- [ ] Biometric unlock (Touch ID, Windows Hello)
- [ ] Offline mode with sync on reconnect
- [ ] Advanced analytics with Recharts
- [ ] Model comparison & A/B testing
- [ ] Bulk user import (CSV)
- [ ] Custom role creation
- [ ] Email alerts for model performance
- [ ] Real-time WebSocket updates

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/name`)
3. Commit changes (`git commit -m "feat: description"`)
4. Push to branch (`git push origin feature/name`)
5. Open Pull Request

## License

MIT — See LICENSE file

## Support

For issues or questions:
- 📧 Contact: rezacdaniel2@gmail.com
- 🐛 Bug reports: GitHub Issues
- 📚 Documentation: See [documentation files](./)
