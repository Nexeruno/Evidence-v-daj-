# Security Documentation - Phase 1 + Phase 2

## Overview
Evidence Výdajů with integrated AI Data Collector has multiple layers of security protection to prevent unauthorized access, data breaches, and denial-of-service attacks.

---

## 🔒 Security Measures Implemented

### 1. CLOUD FUNCTIONS - Rate Limiting
**Problem Solved:** Prevents DOS attacks and brute-force attempts
- `aiGetInsights`: 50 requests/hour per admin
- `aiGetAllInsights`: 20 requests/hour per admin
- `aiTriggerAnalysis`: 5 requests/hour per admin
- `aiUpdateConfig`: 10 requests/hour per admin
- Generic endpoints: 3 requests/10min per IP

**Implementation:** `checkAIRateLimit()` function using Firestore `_rateLimits` collection

### 2. CLOUD FUNCTIONS - Audit Logging
**Problem Solved:** Track all admin actions for accountability and forensics
- Every AI operation is logged to `_auditLog` collection
- Includes: timestamp, adminUid, action, details
- Blocked/rate-limited requests are logged separately

**Actions Logged:**
- `aiGetInsights` - User inspected
- `aiGetAllInsights` - Full analytics accessed
- `aiTriggerAnalysis_START` / `_COMPLETE` / `_ERROR`
- `aiUpdateConfig` - Configuration changed
- All DENIED/BLOCKED actions

**Retention:** All logs stored in Firestore (admin can query via DevOps panel)

### 3. INPUT VALIDATION
**Problem Solved:** Prevents injection attacks and malformed requests

**Cloud Functions:**
- `uid` parameter: string check, max 128 chars
- `isEnabled`: boolean validation
- `dataRetentionDays`: integer 7-365 range
- All parameters validated before processing

**Frontend:**
- `AIControlPanel`: validates `isEnabled` and `retention` before sending
- Error messages displayed to user on validation failure

### 4. FIRESTORE SECURITY RULES
**Problem Solved:** Database-level access control

```
AI Collections:
- aiTelemetry/{uid}/...    → User writes, Admin reads (no public access)
- aiInsights/{uid}         → CF writes only, Admin reads
- aiConfig/global          → Admin reads/writes
- _auditLog/{doc}          → CF writes, Admin reads
- _rateLimits/{doc}        → CF only (no user access)
```

**Protection:**
- Users cannot read other users' AI data
- Users cannot modify their own analytics (read-only from their perspective)
- Admins can read but not directly write (CF mediates)
- Rate limit docs hidden from all clients

### 5. ADMIN VERIFICATION
**Problem Solved:** Only authenticated admins can access AI tools

**Multi-level Check:**
1. Firebase Auth token verification: `verifyAuth(token)`
2. Admin role verification: `verifyAdmin(decodedToken)`
   - Checks token.email === ADMIN_EMAIL, OR
   - Checks users/{uid}.role === 'admin' in Firestore
3. Rate limiting enforcement

### 6. CONTENT SECURITY POLICY (CSP)
**Problem Solved:** Prevents XSS attacks and unauthorized script execution

```
CSP Policy:
- default-src 'self'                                    (deny by default)
- script-src 'self' 'wasm-unsafe-eval'                  (allow local + WASM)
- style-src 'self' 'unsafe-inline'                      (React styles)
- img-src 'self' data:                                  (local + data URIs)
- connect-src 'self' https://[...]                      (Firebase only)
- frame-ancestors 'none'                                (no iframes)
```

### 7. HTTP SECURITY HEADERS
**Problem Solved:** Defense against common web attacks

In `index.html`:
- `X-Content-Type-Options: nosniff` - Prevent MIME sniffing
- `X-Frame-Options: DENY` - No clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin` - Privacy
- `Cache-Control: no-cache, no-store, must-revalidate` - No sensitive caching
- `Content-Security-Policy: [...]` - XSS/injection prevention

### 8. DATA PROTECTION - What's NOT Stored
**Problem Solved:** Minimize sensitive data exposure

AI system specifically DOES NOT store:
- Transaction amounts (`castka`)
- Transaction descriptions (`nazev`)
- User passwords or auth tokens
- IP addresses (currently)

Stores only:
- Behavioral metrics (timing, click counts)
- Navigation patterns
- Category preferences (without amounts)
- Time-of-day patterns

---

## 🔐 Threat Model & Mitigations

| Threat | Risk | Mitigation |
|--------|------|-----------|
| **DOS Attack** | Millions of API calls | Rate limiting (20-50 req/hour) |
| **Unauthorized Admin Access** | Read all users' AI data | Admin verification + Firebase Auth |
| **Brute-force Admin Discovery** | Map which UIDs are admins | Rate limiting + audit logging |
| **Data Injection (SQL/NoSQL)** | Modify stored data | Input validation + CF-only writes |
| **XSS via stored data** | Execute malicious JS | CSP + React escaping (no dangerouslySetInnerHTML) |
| **Unauthorized CF calls** | Call aiTriggerAnalysis 1000x/hour | Rate limiting + admin check |
| **Session hijacking** | Use stolen token | Token expiry handled by Firebase, CSP blocks iframe injection |
| **Data exfiltration** | Download 1000 users' insights | Admin-only endpoints, Firestore rules |
| **CSRF** | Cross-site request forgery | Auth token required (not cookies), CSP |
| **Privilege escalation** | Non-admin tries to call AI endpoints | Double verification: Auth token + role check |

---

## 📋 Admin Responsibilities

1. **Monitor Audit Log** - Check `_auditLog` collection regularly
2. **Review Rate Limit Hits** - Watch for suspicious patterns
3. **Access Control** - Only grant admin role to trusted users
4. **Regular Backups** - Use Firebase Firestore backups
5. **Token Management** - Firebase Auth handles token expiry (1 hour default)

---

## 🚀 Deployment Checklist

- [ ] Deploy Cloud Functions: `firebase deploy --only functions`
- [ ] Deploy Firestore Rules: `firebase deploy --only firestore:indexes`
- [ ] Deploy Indexes: `firebase deploy --only firestore:rules`
- [ ] Verify CSP in browser DevTools (Content-Security-Policy header)
- [ ] Test rate limiting: Make 6 requests quickly, 6th should fail
- [ ] Test audit logging: Check `_auditLog` after admin action
- [ ] Monitor: Set up Cloud Monitoring alerts for high rate-limit blocks

---

## 🔍 Testing Security

### Rate Limiting Test
```javascript
for (let i = 0; i < 6; i++) {
  await fetch('https://.../aiGetAllInsights', {
    headers: { Authorization: `Bearer ${token}` }
  });
}
// Request 6 should return 429 Too Many Requests
```

### Audit Log Test
1. Make an admin action (e.g., trigger analysis)
2. Check Firestore: `_auditLog` collection
3. Verify entry with correct adminUid, action, timestamp

### Input Validation Test
```javascript
// Should fail
await fetch('https://.../aiUpdateConfig', {
  body: JSON.stringify({ dataRetentionDays: 1000 })
});
// Response: { error: 'dataRetentionDays musí být 7-365' }
```

---

## 📝 Security Incident Response

If a security issue is discovered:

1. **Immediate:** Disable admin for suspicious user (via AdminPage)
2. **Investigation:** Check `_auditLog` for compromised account activities
3. **Containment:** Revoke relevant auth tokens if needed
4. **Recovery:** Review and restore from Firebase backup if data was modified
5. **Post-Incident:** Update security rules/rate limits if pattern repeats

---

## 🔄 Future Hardening

Potential enhancements (not yet implemented):
- IP whitelisting for admin accounts
- Field-level encryption for behavioral data
- Two-factor authentication for admin
- Automatic data deletion after retention period
- Security events dashboard in admin panel
- Integration with external SIEM

---

**Last Updated:** 2026-06-01  
**Security Level:** HIGH  
**Compliance:** Suitable for GDPR-aligned personal finance data
