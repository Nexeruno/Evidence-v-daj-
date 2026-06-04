// Set Admin Role for AURIX Core User
// Usage: node set-admin-role.js [email] [path-to-service-account-key]

import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

// Get email from command line arguments
const email = process.argv[2];
const serviceAccountPath = process.argv[3] || './evidence-vydaju-key.json';

if (!email) {
  console.error('❌ Usage: node set-admin-role.js [email] [optional-path-to-key]');
  console.error('Example: node set-admin-role.js danzby@seznam.cz ./evidence-vydaju-12345.json');
  process.exit(1);
}

// Check if service account file exists
if (!fs.existsSync(serviceAccountPath)) {
  console.error(`❌ Service account key not found: ${serviceAccountPath}`);
  console.error('Please provide the path to your Firebase service account key');
  process.exit(1);
}

try {
  // Load service account key
  const serviceAccountContent = fs.readFileSync(path.resolve(serviceAccountPath), 'utf8');
  const serviceAccount = JSON.parse(serviceAccountContent);

  // Initialize Firebase Admin
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'evidence-vydaju'
    });
  }

  const auth = admin.auth();

  // Get user by email
  console.log(`🔍 Looking for user: ${email}`);

  auth.getUserByEmail(email)
    .then((user) => {
      console.log(`✅ Found user: ${user.uid}`);

      // Set custom claims
      console.log(`⚙️ Setting custom claims for ${email}...`);

      return auth.setCustomUserClaims(user.uid, { role: 'admin' });
    })
    .then(() => {
      console.log(`✅ SUCCESS! Custom claims set for ${email}`);
      console.log('');
      console.log('Next steps:');
      console.log('1. Close AURIX Core completely');
      console.log('2. In AURIX Core, press Ctrl+R to reload');
      console.log('3. You should now see "Admin" role in top-right corner');
      console.log('');
      process.exit(0);
    })
    .catch((error) => {
      console.error(`❌ Error:`, error.message);
      process.exit(1);
    });

} catch (error) {
  console.error('❌ Error loading service account key:', error.message);
  process.exit(1);
}
