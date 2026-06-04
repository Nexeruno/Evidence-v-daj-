# AURIX Core Implementation Checklist

Complete 5-phase implementation guide for deploying AURIX Core production system.

## Pre-Deployment Checklist

### 1. Firebase Setup
- [ ] Create Firebase project (if not exists)
- [ ] Enable Firestore database
- [ ] Enable Firebase Authentication
  - [ ] Email/Password
  - [ ] Google sign-in
- [ ] Create custom claims for roles (admin, analyst, viewer)
- [ ] Deploy Firestore security rules (see CLOUD_FUNCTIONS.md)
- [ ] Set up Cloud Functions (see step 3 below)

### 2. Local Development
- [ ] Clone repository
- [ ] Install Node.js 18+ (check: `node --version`)
- [ ] Install dependencies: `npm install`
- [ ] Copy `.env.example` to `.env.local`
- [ ] Fill in Firebase credentials in `.env.local`
- [ ] Test dev server: `npm run dev`
- [ ] Verify Electron window opens
- [ ] Test login flow with test user

### 3. Cloud Functions Deployment

**Required Cloud Functions (7 total):**

```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy individually:
firebase deploy --only functions:adminActivateLevel2Model
firebase deploy --only functions:adminRollbackToLevel1
firebase deploy --only functions:adminExportMlTrainingDataset
firebase deploy --only functions:adminSaveMlPipelineResult
firebase deploy --only functions:adminUpdateUserRole
firebase deploy --only functions:adminCreateUser
firebase deploy --only functions:adminDeleteUser
```

**Verification:**
```bash
# List deployed functions
firebase functions:list

# Test a function
firebase functions:shell
> adminUpdateUserRole({ userId: 'test', newRole: 'analyst' }, { auth: { uid: 'admin', email: 'admin@test.com', token: { role: 'admin' } } })
```

### 4. Firestore Collections & Data

**Create initial collections:**

```javascript
// users collection - sample doc
{
  uid: 'user123',
  email: 'user@example.com',
  displayName: 'John Admin',
  role: 'admin',
  isActive: true,
  createdAt: serverTimestamp(),
  createdBy: 'system'
}

// mlMetrics collection - singleton doc
{
  totalUsers: 50,
  activeSessions: 12,
  lastRunTime: Date.now(),
  totalRunsLevel1: 250,
  totalRunsLevel2: 45,
  shadowAccuracy: 0.942,
  level1Status: 'active',
  level2Status: 'shadow'
}

// mlRuns collection - sample runs
{
  timestamp: Date.now(),
  level: 1,
  status: 'completed',
  accuracy: 0.938,
  processingTime: 1234,
  datasetSize: 5000,
  notes: 'Initial baseline'
}

// mlTrainingData collection
{
  input: 'sample input',
  expectedOutput: 'sample output',
  type: 'manual',
  createdAt: serverTimestamp(),
  createdBy: 'admin@example.com',
  validated: true
}

// mlPredictions collection
{
  timestamp: Date.now(),
  level: 1,
  userId: 'user123',
  input: 'prediction input',
  prediction: 'prediction result',
  confidence: 0.95,
  status: 'success'
}

// userSessions collection
{
  userId: 'user123',
  userName: 'John User',
  lastActivity: Date.now(),
  predictions: 25,
  isActive: true
}

// auditTrail collection
{
  timestamp: serverTimestamp(),
  adminId: 'admin123',
  adminEmail: 'admin@example.com',
  action: 'createUser',
  resourceType: 'user',
  resourceId: 'newuser123',
  details: { email: 'new@example.com', role: 'analyst' },
  status: 'success'
}
```

### 5. ML Pipeline Setup

```bash
# 1. Create ml-pipeline directory
mkdir ml-pipeline
cd ml-pipeline

# 2. Set up Python environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Create src/main.py (see ML_PIPELINE_INTEGRATION.md)
mkdir src
# Copy ml_pipeline code from documentation

# 4. Install dependencies
pip install -r src/requirements.txt

# 5. Test locally
echo '{"idToken": "YOUR_TEST_TOKEN"}' | python src/main.py
# Should output: {"success": true, "message": "...", "accuracy": 0.92, ...}
```

### 6. Environment Configuration

**Update `src/config/firebase.ts`:**
```typescript
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}
```

**Create `.env.local`:**
```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=evidence-vydaju.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=evidence-vydaju
VITE_FIREBASE_STORAGE_BUCKET=evidence-vydaju.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcd1234...
```

### 7. Testing Workflow

#### Authentication Tests
- [ ] Test email/password login
- [ ] Test Google sign-in
- [ ] Test token refresh after role change
- [ ] Test logout functionality
- [ ] Test access denied for unauthorized roles

#### Dashboard Tests
- [ ] Verify metrics display (users, sessions, runs)
- [ ] Check real-time updates from Firestore
- [ ] Test SQLite cache loading (check DevTools > Application)
- [ ] Verify cache clears when needed

#### ML Pipeline Tests
- [ ] Run Level 2 pipeline (should complete in 30-60s)
- [ ] Verify accuracy metrics update
- [ ] Test shadow mode toggle
- [ ] Test model activation (confirm modal)
- [ ] Test rollback to Level 1

#### User Management Tests
- [ ] Create new user (should appear in list)
- [ ] Update user role (verify custom claims)
- [ ] Delete user (soft delete - mark inactive)
- [ ] Prevent removing last admin (error message)
- [ ] Prevent removing own admin role (error message)

#### Audit Trail Tests
- [ ] Verify all actions logged
- [ ] Test filtering by admin & action
- [ ] Check timestamps are correct
- [ ] Verify success/failure status

### 8. Production Deployment

#### Build & Package
```bash
npm run build
npm run electron-builder
```

Output: `out/AURIX Core-1.0.0.exe` (Windows) or `.dmg` (macOS)

#### Distribution
- [ ] Code-sign executable (macOS)
- [ ] Test installer on clean machine
- [ ] Upload to GitHub Releases
- [ ] Create update manifest for auto-updates

#### Post-Deployment
- [ ] Verify app opens correctly
- [ ] Test login with production Firebase
- [ ] Run all user journeys
- [ ] Monitor Firestore read/write usage
- [ ] Check Cloud Function invocation logs

### 9. Security Verification

- [ ] Firestore rules are in place (admin-only access)
- [ ] Cloud Functions verify admin role
- [ ] Custom claims are properly merged (not overwritten)
- [ ] Audit trail is being populated
- [ ] No sensitive data in localStorage
- [ ] IPC bridge only exposes necessary APIs
- [ ] Electron context isolation enabled
- [ ] Preload script has proper exports

### 10. Performance Verification

- [ ] Dashboard loads in <1 second (with cache)
- [ ] ML pipeline completes in expected time
- [ ] Firestore reads are within quota (~100/day)
- [ ] SQLite cache is being used (monitor in DevTools)
- [ ] No memory leaks (check DevTools > Memory)
- [ ] CPU usage is normal during idle

## Known Issues & Workarounds

### Issue: "Token passed through stdin is visible in process list"
**Workaround:** Token is only passed at process start, not in args/env. Still recommended to run AURIX Core on secure machines.

### Issue: "User needs to re-login after role change"
**Current behavior:** Custom claims are updated, but user needs `getIdToken(true)` or re-login to get new token.
**Workaround:** Prompt user to re-authenticate when role changes: "Your role was updated. Please sign out and sign back in."

### Issue: "Firestore quota exceeded"
**Workaround:** Enable cache in Settings (default on). Most reads hit SQLite, reducing Firestore calls by 70%.

### Issue: "ML pipeline hangs on large datasets"
**Workaround:** Set timeout in Electron: `pythonProcess.timeout = 300000` (5 minutes). Limit dataset size in Cloud Function export.

### Issue: "Last admin protection doesn't work"
**Verification:** Check Cloud Function is using latest code and custom claims are correct.
**Fix:** Re-deploy Cloud Functions: `firebase deploy --only functions:adminUpdateUserRole`

## Rollback Plan

If issues occur in production:

1. **Immediate:** Disable user logins in Firebase Console (disable Auth provider)
2. **Disable ML:** Set `mlMetrics.level2Status = 'rollback'` in Firestore
3. **Investigate:** Check Cloud Function logs in Firebase Console
4. **Fix & Redeploy:**
   ```bash
   # Fix code
   # Redeploy functions
   firebase deploy --only functions
   ```
5. **Verify:** Test in staging before re-enabling production
6. **Re-enable:** Turn auth back on

## Support Contacts

- 📧 Admin: rezacdaniel2@gmail.com
- 🐛 Bug Reports: GitHub Issues
- 📚 Documentation: See `*.md` files in `desktop-app/`

## Maintenance Schedule

### Daily
- Monitor Firestore quota usage
- Check Cloud Function error logs
- Verify Level 1 predictions are serving

### Weekly
- Review audit trail for anomalies
- Check cache size (clear if >50 MB)
- Verify backup of training data

### Monthly
- Update dependencies: `npm update`
- Review security rules
- Export audit trail for compliance
- Test disaster recovery plan

## Version History

- **1.0.0** (Current)
  - 5 phases complete
  - All core features implemented
  - Production ready

## Next Steps

1. Deploy Cloud Functions (step 3)
2. Set up Firestore collections (step 4)
3. Configure Python ML pipeline (step 5)
4. Test on staging environment
5. Deploy to production
6. Monitor first week closely
