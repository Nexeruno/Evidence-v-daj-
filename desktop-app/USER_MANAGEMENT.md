# User Management for AURIX Core

User and role management in AURIX Core operates through Cloud Functions and Firestore. This document explains the implementation and security considerations.

## Architecture

```
UsersPage / RolesPage (UI)
    ↓
useAuth.getIdToken() (Client SDK)
    ↓
IPC: callCloudFunction()
    ↓
Electron main.ts (HTTPS with Bearer token)
    ↓
Cloud Function adminUpdateUserRole
    ↓
Verify admin role in custom claims
    ↓
Check protection rules (no removing last admin, no removing own role)
    ↓
setCustomUserClaims() + Merge with existing claims
    ↓
Update users collection in Firestore
    ↓
Log to auditTrail collection
    ↓
Return success/error
```

## Key Functions

### adminUpdateUserRole (Priority: HIGH)

**Purpose:** Update a user's admin role with protection against breaking access.

**Implementation:**

```typescript
export const adminUpdateUserRole = functions.https.onCall(async (data, context) => {
  // 1. Verify admin role
  if (!context.auth?.token.role || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required')
  }

  const { userId, newRole } = data
  const adminId = context.auth.uid
  const adminEmail = context.auth.email

  // 2. Prevent removing own admin role
  if (userId === adminId && newRole !== 'admin') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Cannot remove your own admin role'
    )
  }

  // 3. Prevent removing last admin
  const adminCount = await admin.auth().listUsers()
    .then(result => result.users.filter(u => {
      const claims = u.customClaims || {}
      return claims.role === 'admin'
    }).length)

  if (adminCount === 1 && newRole !== 'admin') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Cannot remove last admin user'
    )
  }

  // 4. Get existing custom claims and merge (don't overwrite)
  const existingUser = await admin.auth().getUser(userId)
  const existingClaims = existingUser.customClaims || {}

  const newClaims = {
    ...existingClaims,  // Merge: keep other claims like org_id, etc.
    role: newRole,
    roleUpdatedAt: admin.firestore.Timestamp.now()
  }

  // 5. Update custom claims in Auth
  await admin.auth().setCustomUserClaims(userId, newClaims)

  // 6. Update Firestore users document
  const usersRef = admin.firestore().collection('users').doc(userId)
  await usersRef.set({
    role: newRole,
    roleUpdatedBy: adminId,
    roleUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })

  // 7. Log to audit trail
  await admin.firestore().collection('auditTrail').add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    adminId,
    adminEmail,
    action: 'updateUserRole',
    resourceType: 'user',
    resourceId: userId,
    details: {
      oldRole: existingClaims.role || 'none',
      newRole,
    },
    status: 'success'
  })

  // 8. Force token refresh for the updated user
  // (They need to re-authenticate to get new custom claims in their ID token)

  return {
    success: true,
    message: `User role updated to ${newRole}`,
    oldRole: existingClaims.role,
    newRole,
  }
})
```

**Security Notes:**
- ✅ Merges claims, doesn't overwrite (preserves org_id, etc.)
- ✅ Prevents removing last admin
- ✅ Prevents removing own admin role
- ✅ Logs all changes to audit trail
- ⚠️ User must re-authenticate to get new token with updated claims
- ⚠️ Firestore rules must enforce access control separately

### adminCreateUser (Priority: MEDIUM)

**Purpose:** Create new admin users.

```typescript
export const adminCreateUser = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token.role || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required')
  }

  const { email, displayName, role = 'viewer' } = data

  try {
    // Create user in Auth
    const userRecord = await admin.auth().createUser({
      email,
      displayName,
      password: generateRandomPassword() // Force email verification
    })

    // Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role,
      createdAt: admin.firestore.Timestamp.now()
    })

    // Create Firestore user doc
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      displayName,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid,
      isActive: true,
    })

    // Log
    await admin.firestore().collection('auditTrail').add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      adminId: context.auth.uid,
      adminEmail: context.auth.email,
      action: 'createUser',
      resourceType: 'user',
      resourceId: userRecord.uid,
      details: { email, displayName, role },
      status: 'success'
    })

    return {
      success: true,
      message: 'User created successfully',
      userId: userRecord.uid,
    }
  } catch (error) {
    throw new functions.https.HttpsError('internal', 'Failed to create user')
  }
})
```

### adminDeleteUser (Priority: MEDIUM)

**Purpose:** Deactivate or delete a user (soft delete recommended).

```typescript
export const adminDeleteUser = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token.role || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required')
  }

  const { userId } = data

  // Soft delete: mark as inactive
  await admin.firestore().collection('users').doc(userId).update({
    isActive: false,
    deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
    deactivatedBy: context.auth.uid,
  })

  // Log
  await admin.firestore().collection('auditTrail').add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    adminId: context.auth.uid,
    adminEmail: context.auth.email,
    action: 'deleteUser',
    resourceType: 'user',
    resourceId: userId,
    details: {},
    status: 'success'
  })

  return { success: true, message: 'User deactivated' }
})
```

## Firestore Collections

### users

```typescript
{
  uid: string (document ID)
  email: string
  displayName?: string
  role: 'admin' | 'analyst' | 'viewer'
  createdAt: timestamp
  createdBy: uid
  roleUpdatedAt?: timestamp
  roleUpdatedBy?: uid
  isActive: boolean
  lastActivity?: timestamp
}
```

### auditTrail

```typescript
{
  id: string (auto-generated)
  timestamp: timestamp
  adminId: uid
  adminEmail: string
  action: 'createUser' | 'updateUserRole' | 'deleteUser' | 'createRole' | 'activateLevel2' | 'rollback' | ...
  resourceType: 'user' | 'role' | 'model' | 'pipeline'
  resourceId: string
  details: {
    [key: string]: any // Action-specific details
  }
  status: 'success' | 'failure'
  errorMessage?: string
}
```

## Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - admin-only read/write
    match /users/{userId} {
      allow read: if request.auth.token.role == 'admin';
      allow write: if false; // Only via Cloud Functions
    }

    // Audit trail - admin-only read
    match /auditTrail/{document=**} {
      allow read: if request.auth.token.role == 'admin';
      allow write: if false; // Only via Cloud Functions
    }
  }
}
```

## Role Merging Strategy (IMPORTANT)

When updating user roles, ALWAYS merge with existing custom claims to preserve other data:

```typescript
// ❌ WRONG - Overwrites existing claims
await admin.auth().setCustomUserClaims(userId, { role: 'admin' })

// ✅ CORRECT - Merges claims
const existingUser = await admin.auth().getUser(userId)
const existingClaims = existingUser.customClaims || {}
await admin.auth().setCustomUserClaims(userId, {
  ...existingClaims,  // Preserve all existing claims
  role: 'admin',      // Update only the role
  updatedAt: timestamp
})
```

## Token Refresh Flow

After a user's role is updated:

1. Cloud Function updates custom claims
2. User's current ID token still has old claims (cached)
3. User signs out and signs back in
4. New ID token includes updated claims
5. OR: Call `getIdToken(true)` to force refresh

**In AURIX Core:**
```typescript
const token = await getIdToken(true)  // Force refresh after role update
```

## Testing Cloud Functions

### Test adminUpdateUserRole locally:

```bash
firebase functions:shell

# In the shell:
adminUpdateUserRole({
  userId: 'user-uid-to-update',
  newRole: 'analyst'
}, {
  auth: {
    uid: 'admin-user-uid',
    email: 'admin@example.com',
    token: { role: 'admin' }
  }
})
```

## Deployment

```bash
firebase deploy --only functions:adminUpdateUserRole,functions:adminCreateUser,functions:adminDeleteUser
```

## Known Limitations

- User must re-authenticate to get updated claims in their token
- Firestore read operations still check rules (custom claims alone don't grant access)
- Audit trail retention: 90 days (configurable via Cloud Tasks)
- Role changes are not real-time (next token refresh required)
