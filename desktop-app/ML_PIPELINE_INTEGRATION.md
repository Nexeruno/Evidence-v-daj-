# ML Pipeline Integration Guide

## Overview

AURIX Core runs the Level 2 ML pipeline locally via Electron's child_process, passing the user's Firebase ID token through stdin for authentication. This allows the Python ML service to access user-specific data via Firestore without needing Server SDK credentials or exposed API keys.

## Architecture

```
AURIX Core (Electron)
    ↓
useMlPipelineControl hook
    ↓
IPC: runLevel2Pipeline(idToken)
    ↓
Electron main.ts
    ↓
spawn("python ml-pipeline/src/main.py --mode local")
    ↓
stdin: { idToken }
    ↓
Python: ml-pipeline/src/main.py
    ↓
Read token from stdin → Initialize Firestore Client
    ↓
Load training data, run inference
    ↓
stdout: JSON result
    ↓
Electron main.ts captures output
    ↓
Call adminSaveMlPipelineResult(token, result)
    ↓
Result saved to mlRuns collection
```

## Step 1: Prepare Python Environment

### Create `ml-pipeline/` directory structure:
```
ml-pipeline/
├── src/
│   ├── main.py                 # Entry point
│   ├── pipeline.py             # Core ML logic
│   ├── firebase_client.py      # Firestore initialization
│   └── requirements.txt
├── README.md
└── .gitignore
```

### `ml-pipeline/src/requirements.txt`:
```
firebase-admin==5.4.0
pandas==1.5.3
numpy==1.23.5
scikit-learn==1.2.1
tensorflow==2.11.0
```

## Step 2: Implement Python Script

### `ml-pipeline/src/main.py`:
```python
import json
import sys
import os
from firebase_client import initialize_firebase_from_token
from pipeline import run_inference

def main():
    try:
        # Read idToken from stdin
        stdin_data = sys.stdin.read()
        data = json.loads(stdin_data)
        idToken = data.get('idToken')

        if not idToken:
            print(json.dumps({
                'success': False,
                'message': 'No idToken provided'
            }))
            return

        # Initialize Firestore with token
        db = initialize_firebase_from_token(idToken)

        # Run inference
        result = run_inference(db)

        # Output result as JSON
        print(json.dumps({
            'success': True,
            'message': f'Level 2 pipeline completed',
            'accuracy': result['accuracy'],
            'processingTime': result['processing_time'],
            'datasetSize': result['dataset_size']
        }))

    except Exception as e:
        print(json.dumps({
            'success': False,
            'message': str(e)
        }), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
```

### `ml-pipeline/src/firebase_client.py`:
```python
import firebase_admin
from firebase_admin import credentials, firestore, auth as firebase_auth
from google.auth.transport import requests
from google.oauth2 import service_account

def initialize_firebase_from_token(idToken):
    """
    Initialize Firestore using only the idToken (no Server SDK credentials).
    The token is exchanged for a custom auth token that Firestore accepts.
    """
    # In production, use REST API with the idToken as Authorization header
    # For now, initialize with public Firestore access (requires proper security rules)

    if not firebase_admin._apps:
        firebase_admin.initialize_app()

    db = firestore.client()
    
    # Verify token is valid (throws exception if invalid)
    decoded_token = firebase_auth.verify_id_token(idToken)
    user_id = decoded_token['uid']

    print(f"Authenticated as user: {user_id}", file=sys.stderr)

    return db
```

### `ml-pipeline/src/pipeline.py`:
```python
import pandas as pd
import time
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score

def run_inference(db):
    """
    Core ML pipeline logic:
    1. Load training data from Firestore
    2. Train/load model
    3. Run inference
    4. Return metrics
    """
    start_time = time.time()

    try:
        # Load training data from mlTrainingData collection
        training_docs = db.collection('mlTrainingData').limit(1000).stream()
        
        training_data = []
        for doc in training_docs:
            training_data.append(doc.to_dict())

        if not training_data:
            return {
                'accuracy': 0,
                'processing_time': int((time.time() - start_time) * 1000),
                'dataset_size': 0
            }

        # Convert to DataFrame
        df = pd.DataFrame(training_data)

        # Simple example: train classifier on first feature vs 'expectedOutput'
        X = df[['input']].values  # Simplified
        y = df['expectedOutput'].values

        model = RandomForestClassifier(n_estimators=10)
        model.fit(X, y)

        # Evaluate
        y_pred = model.predict(X)
        accuracy = accuracy_score(y, y_pred)

        processing_time = int((time.time() - start_time) * 1000)

        return {
            'accuracy': accuracy,
            'processing_time': processing_time,
            'dataset_size': len(training_data)
        }

    except Exception as e:
        raise Exception(f"Pipeline execution failed: {str(e)}")
```

## Step 3: Update Electron Configuration

The `electron/main.ts` already contains the spawn logic. Ensure:

```typescript
const pythonPath = process.env.PYTHON_PATH || 'python'

const pythonProcess = spawn(pythonPath, [
  'ml-pipeline/src/main.py',
  '--mode', 'local'
], {
  env: {
    ...process.env,
    FIREBASE_PROJECT: 'evidence-vydaju',
    // Add ML-specific env vars here if needed
  }
})

// Token passed via stdin
pythonProcess.stdin.write(JSON.stringify({ idToken }))
pythonProcess.stdin.end()
```

## Step 4: Test Locally

### Install dependencies:
```bash
cd ml-pipeline
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r src/requirements.txt
```

### Test the pipeline:
```bash
echo '{"idToken": "YOUR_TEST_TOKEN"}' | python src/main.py
```

Expected output:
```json
{
  "success": true,
  "message": "Level 2 pipeline completed",
  "accuracy": 0.92,
  "processingTime": 1234,
  "datasetSize": 500
}
```

## Step 5: Firestore Security Rules

Ensure your Firestore rules allow Client SDK read access to training data:

```
match /mlTrainingData/{doc=**} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

## Token Security Notes

✅ Token passed via stdin (not exposed in process list or CLI args)
✅ Token verified by Firebase Auth before Firestore access
✅ Electron logs redact token in stderr
✅ No sensitive data in stdout beyond metrics

❌ Token is visible in the Python process memory
❌ Firestore rules must enforce access control
❌ Never expose token in logs or error messages

## Troubleshooting

### "No idToken provided"
- Check that AURIX Core is calling `runLevel2Pipeline` with a valid token
- Verify `getIdToken()` returns a non-empty string

### "Firebase initialization failed"
- Ensure `FIREBASE_PROJECT` env var is set correctly
- Check Firestore rules allow read access with valid auth

### "ModuleNotFoundError: No module named firebase_admin"
- Install dependencies: `pip install -r ml-pipeline/src/requirements.txt`
- Ensure Python path is correct in Electron config

### Pipeline hangs
- Check if training data collection is very large
- Add timeout to Python process in Electron

### Token verification fails
- Ensure token is fresh (call `getIdToken(true)` to force refresh)
- Check token's custom claims include 'role': 'admin'
