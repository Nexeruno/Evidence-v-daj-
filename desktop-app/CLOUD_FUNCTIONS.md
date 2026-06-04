# Cloud Functions for AURIX Core

These Cloud Functions must be deployed in the Evidence výdajů Firebase project. They serve as the secure backend for admin operations that cannot be done with Client SDK.

## Required Functions

### 1. adminActivateLevel2Model
Moves Level 2 from shadow mode to production (activates model).

**Trigger:** HTTP
**Auth:** Custom claims verification (role: 'admin')

```typescript
export const adminActivateLevel2Model = functions.https.onCall(async (data, context) => {
  // Verify admin role
  if (!context.auth?.token.role || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required')
  }

  // Update mlMetrics.level2Status = 'active'
  // Update mlMetrics.level1Status = 'inactive' (optional - keep L1 as backup)
  // Log to audit trail
  // Return { success: true, message: 'Level 2 activated' }
})
```

### 2. adminRollbackToLevel1
Rolls back to Level 1 predictions (disables Level 2).

**Trigger:** HTTP
**Auth:** Custom claims verification (role: 'admin')

```typescript
export const adminRollbackToLevel1 = functions.https.onCall(async (data, context) => {
  // Verify admin role
  if (!context.auth?.token.role || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required')
  }

  const { reason } = data

  // Update mlMetrics.level2Status = 'rollback'
  // Update mlMetrics.level1Status = 'active'
  // Log reason to audit trail with timestamp
  // Return { success: true, message: 'Rolled back to Level 1', reason }
})
```

### 3. adminExportMlTrainingDataset
Exports ML training data for model retraining.

**Trigger:** HTTP
**Auth:** Custom claims verification (role: 'admin')

```typescript
export const adminExportMlTrainingDataset = functions.https.onCall(async (data, context) => {
  // Verify admin role
  if (!context.auth?.token.role || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required')
  }

  const { limit = 10000 } = data

  // Query mlTrainingData collection, limit results
  // Convert to JSON/CSV format
  // Generate signed URL for GCS bucket storage
  // Log export to audit trail
  // Return { success: true, downloadUrl: '...', count: 5000 }
})
```

### 4. adminSaveMlPipelineResult
Saves Level 2 pipeline execution result to Firestore.

**Trigger:** HTTP
**Auth:** Custom claims verification (role: 'admin') OR direct from Electron (verify idToken)

```typescript
export const adminSaveMlPipelineResult = functions.https.onCall(async (data, context) => {
  // Verify admin role OR Electron process
  if (!context.auth?.token.role || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required')
  }

  const { timestamp, level, status, accuracy, processingTime, datasetSize, notes } = data

  // Save to mlRuns collection
  // Update mlMetrics if needed
  // Return { success: true, runId: '...' }
})
```

### 5. adminUpdateUserRole
Updates user's admin role (with protection against removing last admin).

**Trigger:** HTTP
**Auth:** Custom claims verification (role: 'admin')

```typescript
export const adminUpdateUserRole = functions.https.onCall(async (data, context) => {
  // Verify admin role
  if (!context.auth?.token.role || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required')
  }

  const { userId, newRole } = data
  const adminId = context.auth.uid

  // Prevent removing own admin role
  if (userId === adminId && newRole !== 'admin') {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot remove your own admin role')
  }

  // Prevent removing last admin
  const adminCount = await db.collection('users')
    .where('role', '==', 'admin').count().get()
  if (adminCount.data().count === 1 && newRole !== 'admin') {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot remove last admin')
  }

  // Update custom claims: setCustomUserClaims(userId, { role: newRole })
  // Merge with existing claims, don't overwrite
  // Update users collection
  // Log to audit trail
  // Return { success: true, message: 'Role updated' }
})
```

### 6. adminCreateTrainingData
Creates new training data entries for ML model.

**Trigger:** HTTP
**Auth:** Custom claims verification (role: 'admin')

```typescript
export const adminCreateTrainingData = functions.https.onCall(async (data, context) => {
  // Verify admin role
  if (!context.auth?.token.role || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required')
  }

  const { entries, type = 'manual' } = data

  // Batch write to mlTrainingData collection
  // Each entry: { input, expectedOutput, type, createdBy, createdAt, validated }
  // Return { success: true, count: 100 }
})
```

### 7. adminGetMlRuns
Gets ML run history (optional, can use client-side Firestore query instead).

**Trigger:** HTTP
**Auth:** Custom claims verification (role: 'admin')

```typescript
export const adminGetMlRuns = functions.https.onCall(async (data, context) => {
  // Verify admin role
  if (!context.auth?.token.role || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required')
  }

  const { limit = 100, offset = 0 } = data

  // Query mlRuns collection with pagination
  // Return { success: true, runs: [...], total: 500 }
})
```

## Firestore Collections

### mlMetrics
Singleton document with current system metrics.
```
{
  totalUsers: number
  activeSessions: number
  lastRunTime: timestamp | null
  totalRunsLevel1: number
  totalRunsLevel2: number
  shadowAccuracy: number (0-1)
  level1Status: 'active' | 'inactive'
  level2Status: 'shadow' | 'active' | 'rollback'
}
```

### mlRuns
Records of each ML pipeline execution.
```
{
  timestamp: number (Date.now())
  level: 1 | 2
  status: 'pending' | 'completed' | 'failed'
  accuracy: number (0-1)
  processingTime: number (ms)
  datasetSize: number
  notes: string
}
```

### mlPredictions
Individual prediction records (for analytics/debugging).
```
{
  timestamp: number
  level: 1 | 2
  userId: string
  input: string | object
  prediction: string | object
  confidence: number (0-1)
  status: 'success' | 'error'
}
```

### mlTrainingData
Training data for model retraining.
```
{
  input: string | object
  expectedOutput: string | object
  type: 'manual' | 'automated' | 'production'
  createdBy: uid
  createdAt: timestamp
  validated: boolean
}
```

### userSessions
Active user sessions for dashboard display.
```
{
  userId: uid
  userName: string
  lastActivity: timestamp
  predictions: number
  isActive: boolean
}
```

## Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin-only access
    match /mlMetrics/{doc=**} {
      allow read: if request.auth.token.role == 'admin';
      allow write: if false; // Only via Cloud Functions
    }

    match /mlRuns/{doc=**} {
      allow read: if request.auth.token.role == 'admin';
      allow write: if false; // Only via Cloud Functions
    }

    match /mlPredictions/{doc=**} {
      allow read: if request.auth.token.role == 'admin';
      allow write: if false; // Only via Cloud Functions
    }

    match /mlTrainingData/{doc=**} {
      allow read: if request.auth.token.role == 'admin';
      allow write: if false; // Only via Cloud Functions
    }

    match /userSessions/{doc=**} {
      allow read: if request.auth.token.role == 'admin';
      allow write: if false; // Only via web app
    }

    match /auditTrail/{doc=**} {
      allow read: if request.auth.token.role == 'admin';
      allow write: if false; // Only via Cloud Functions
    }
  }
}
```

## Deployment

```bash
firebase deploy --only functions:adminActivateLevel2Model,functions:adminRollbackToLevel1,functions:adminExportMlTrainingDataset,functions:adminSaveMlPipelineResult,functions:adminUpdateUserRole,functions:adminCreateTrainingData,functions:adminGetMlRuns
```

## Testing

Test with curl:
```bash
curl -X POST https://us-central1-evidence-vydaju.cloudfunctions.net/adminActivateLevel2Model \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timestamp": 1234567890}'
```
