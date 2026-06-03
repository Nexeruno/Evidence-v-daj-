# Evidence v Datech

Modern financial tracking application with production-grade DevOps and security practices.

**Live:** https://nexeruno.github.io/Evidence-v-daj/

---

## Quick Start

### Prerequisites
- Node.js 20+
- npm or yarn
- Firebase account (for cloud functions)

### Local Development

```bash
# Install dependencies
npm install

# Run dev server
npm run dev
```

Open http://localhost:5173

### Build & Deploy

```bash
# Build for production
npm run build

# Deploy to GitHub Pages (requires setup)
npm run deploy
```

---

## Project Structure

```
src/
├── components/          # React components
│   ├── Dashboard.jsx
│   ├── FormVydaj.jsx   # Expense form
│   ├── FormPrijem.jsx  # Income form
│   ├── SeznamVydaj.jsx # Expense list
│   ├── SeznamPrijem.jsx# Income list
│   └── admin/          # Admin panels
├── context/            # React Context
│   ├── AuthContext.jsx # Firebase auth
│   └── ThemeContext.jsx# Dark mode
├── hooks/              # Custom hooks
├── utils/              # Utilities
│   ├── firebase.js     # Firebase config
│   ├── store.js        # Zustand store
│   └── aiTracker.js    # AI telemetry
├── config/             # Configuration
└── App.jsx             # Main component

functions/             # Cloud Functions
├── index.js           # Admin operations
└── package.json

k8s/                   # Kubernetes manifests
├── deployment.yaml
├── service.yaml
├── ingress.yaml
└── hpa.yaml

.github/workflows/     # GitHub Actions
├── deploy.yml         # CI/CD pipeline
├── test.yml           # Test workflow
└── rollback.yml       # Rollback workflow
```

---

## Features

### Core
- 📊 Real-time income/expense tracking
- 💾 Cloud sync with Firestore
- 🔐 Firebase Authentication
- 🌙 Dark mode with persistence

### Admin
- 👤 User management
- 🔑 Password reset
- 🚫 User blocking
- 📋 Audit logs

### DevOps
- 🔄 Automated CI/CD with GitHub Actions
- 🧪 Unit tests (Vitest)
- 🌐 Smoke tests
- 📊 Structured logging to Cloud Logging
- 🐳 Docker support
- ☸️ Kubernetes ready

---

## CI/CD Pipeline

Automated on every push to `main`:

```
1. Install dependencies (npm ci)
2. Lint code (ESLint)
3. Run tests (npm test)
4. Build (npm run build)
5. Smoke tests (HTML validation, assets check)
6. Deploy to GitHub Pages
7. Notify on failure
```

**Status:** Check GitHub Actions tab

---

## Logging

### Firebase Cloud Functions

All admin operations are logged to Firebase Cloud Logging:

```javascript
logger.info('password_reset_requested', {
  functionName: 'posliResetHesla',
  event: 'password_reset_requested',
  uid: userUid,
  adminUid: adminUid,
  status: 'initiated'
});
```

**View logs:**
```bash
firebase functions:log
```

---

## Security

### Firestore Rules
- Owner-only access to personal data
- Admin overrides for management
- Rate limiting on sensitive operations
- Audit logging for all admin actions

### Best Practices
- No passwords or tokens in logs
- Sensitive data filtered before logging
- JWT-based authentication
- Admin role verification

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + Tailwind CSS |
| State | Zustand |
| Backend | Firebase Cloud Functions |
| Database | Firestore |
| Auth | Firebase Authentication |
| Logging | Firebase Cloud Logging |
| CI/CD | GitHub Actions |
| Deployment | GitHub Pages + Firebase |
| Container | Docker + Kubernetes |

---

## Environment Setup

### 1. Firebase

Create `.env.local`:

```env
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
VITE_ADMIN_EMAIL=your@email.com
```

### 2. GitHub Secrets

For CI/CD pipeline to work, add to GitHub repo settings:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `ADMIN_EMAIL`

### 3. Cloud Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

---

## Docker

### Build
```bash
docker build -t evidence-vydaju .
```

### Run
```bash
docker run -p 80:80 evidence-vydaju
```

---

## Kubernetes

### Deploy
```bash
kubectl apply -k k8s/
```

### Check status
```bash
kubectl get all -n evidence
```

---

## Testing

### Run Tests
```bash
npm test
```

### Watch Mode
```bash
npm test -- --watch
```

### Coverage
```bash
npm test -- --coverage
```

---

## Monitoring

### Local
```bash
bash MONITORING.sh
```

### Firebase
```bash
firebase functions:log
```

---

## Troubleshooting

### Build fails
```bash
npm ci
npm run lint
npm test
```

### Firebase not syncing
- Check internet connection
- Verify Firestore security rules
- Check browser console for errors
- Review Firebase project settings

### Tests failing
```bash
npm test -- --reporter=verbose
```

---

## Contributing

1. Create a branch (`git checkout -b feature/name`)
2. Make changes
3. Push to branch (`git push origin feature/name`)
4. Open Pull Request

GitHub Actions will automatically lint, test, and preview your changes.

---

## Documentation

- [Deployment Guide](.github/DEPLOYMENT.md)
- [Security Details](SECURITY.md)
- [DevOps Guide](DEVOPS.md)
- [Kubernetes Setup](KUBERNETES.md)
- [Firebase Guide](FIREBASE_DEPLOY.md)

---

## License

MIT

---

## Author

Dan - Learning DevOps & MLOps through practical projects

**Next Steps:**
- [ ] Add ML pipeline for spending predictions
- [ ] Add Prometheus + Grafana monitoring
- [ ] Add E2E tests with Playwright
- [ ] Add staging environment

---

---

# 🇨🇿 Evidence v Datech

Moderní aplikace na správu příjmů a výdajů s production-grade DevOps a bezpečnostními praktikami.

**Live:** https://nexeruno.github.io/Evidence-v-daj/

---

## Rychlý Start

### Požadavky
- Node.js 20+
- npm nebo yarn
- Firebase účet (pro cloud funkce)

### Lokální Vývoj

```bash
# Instalace závislostí
npm install

# Spuštění dev serveru
npm run dev
```

Otevřete http://localhost:5173

### Build a Deploy

```bash
# Build pro produkci
npm run build

# Deploy na GitHub Pages (vyžaduje setup)
npm run deploy
```

---

## Struktura Projektu

```
src/
├── components/          # React komponenty
│   ├── Dashboard.jsx
│   ├── FormVydaj.jsx   # Formulář výdajů
│   ├── FormPrijem.jsx  # Formulář příjmů
│   ├── SeznamVydaj.jsx # Seznam výdajů
│   ├── SeznamPrijem.jsx# Seznam příjmů
│   └── admin/          # Admin panely
├── context/            # React Context
│   ├── AuthContext.jsx # Firebase auth
│   └── ThemeContext.jsx# Dark mode
├── hooks/              # Custom hooks
├── utils/              # Utility funkce
│   ├── firebase.js     # Firebase config
│   ├── store.js        # Zustand store
│   └── aiTracker.js    # AI telemetrie
├── config/             # Konfigurace
└── App.jsx             # Hlavní komponenta

functions/             # Cloud Functions
├── index.js           # Admin operace
└── package.json

k8s/                   # Kubernetes manifesty
├── deployment.yaml
├── service.yaml
├── ingress.yaml
└── hpa.yaml

.github/workflows/     # GitHub Actions
├── deploy.yml         # CI/CD pipeline
├── test.yml           # Test workflow
└── rollback.yml       # Rollback workflow
```

---

## Features

### Základní
- 📊 Real-time sledování příjmů a výdajů
- 💾 Cloud sync s Firestore
- 🔐 Firebase Authentication
- 🌙 Dark mode s persistencí

### Admin
- 👤 Správa uživatelů
- 🔑 Reset hesla
- 🚫 Blokování uživatelů
- 📋 Audit logy

### DevOps
- 🔄 Automatizovaný CI/CD s GitHub Actions
- 🧪 Unit testy (Vitest)
- 🌐 Smoke testy
- 📊 Strukturované logování do Cloud Logging
- 🐳 Docker support
- ☸️ Kubernetes ready

---

## CI/CD Pipeline

Automaticky spouštěn při každém pushu do `main`:

```
1. Instalace závislostí (npm ci)
2. Lint kódu (ESLint)
3. Spuštění testů (npm test)
4. Build (npm run build)
5. Smoke testy (validace HTML, kontrola assetů)
6. Deploy na GitHub Pages
7. Notifikace při selhání
```

**Status:** Podívejte se na GitHub Actions tab

---

## Logování

### Firebase Cloud Functions

Všechny admin operace jsou logovány do Firebase Cloud Logging:

```javascript
logger.info('password_reset_requested', {
  functionName: 'posliResetHesla',
  event: 'password_reset_requested',
  uid: userUid,
  adminUid: adminUid,
  status: 'initiated'
});
```

**Prohlížení logů:**
```bash
firebase functions:log
```

---

## Bezpečnost

### Firestore Rules
- Přístup jen vlastníka k osobním datům
- Admin overrides pro správu
- Rate limiting na citlivých operacích
- Audit logging pro všechny admin akce

### Best Practices
- Žádná hesla nebo tokeny v logech
- Citlivá data filtrovaná před logováním
- JWT-based autentizace
- Ověření admin role

---

## Tech Stack

| Layer | Technologie |
|-------|------------|
| Frontend | React 18 + Vite + Tailwind CSS |
| State | Zustand |
| Backend | Firebase Cloud Functions |
| Database | Firestore |
| Auth | Firebase Authentication |
| Logging | Firebase Cloud Logging |
| CI/CD | GitHub Actions |
| Deployment | GitHub Pages + Firebase |
| Container | Docker + Kubernetes |

---

## Nastavení Prostředí

### 1. Firebase

Vytvořte `.env.local`:

```env
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
VITE_ADMIN_EMAIL=vase@email.com
```

### 2. GitHub Secrets

Pro CI/CD pipeline přidejte do GitHub repo nastavení:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `ADMIN_EMAIL`

### 3. Cloud Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

---

## Docker

### Build
```bash
docker build -t evidence-vydaju .
```

### Spuštění
```bash
docker run -p 80:80 evidence-vydaju
```

---

## Kubernetes

### Deploy
```bash
kubectl apply -k k8s/
```

### Stav
```bash
kubectl get all -n evidence
```

---

## Testování

### Spuštění Testů
```bash
npm test
```

### Watch Mode
```bash
npm test -- --watch
```

### Coverage
```bash
npm test -- --coverage
```

---

## Monitoring

### Lokálně
```bash
bash MONITORING.sh
```

### Firebase
```bash
firebase functions:log
```

---

## Řešení Problémů

### Build selže
```bash
npm ci
npm run lint
npm test
```

### Firebase se nesynchronizuje
- Zkontrolujte internetové připojení
- Ověřte Firestore security rules
- Zkontrolujte konzoli prohlížeče
- Zkontrolujte Firebase project settings

### Testy selhávají
```bash
npm test -- --reporter=verbose
```

---

## Přispívání

1. Vytvořte branch (`git checkout -b feature/name`)
2. Udělejte změny
3. Push do branch (`git push origin feature/name`)
4. Otevřete Pull Request

GitHub Actions automaticky provede lint, testy a preview vašich změn.

---

## Dokumentace

- [Deployment Guide](.github/DEPLOYMENT.md)
- [Security Details](SECURITY.md)
- [DevOps Guide](DEVOPS.md)
- [Kubernetes Setup](KUBERNETES.md)
- [Firebase Guide](FIREBASE_DEPLOY.md)

---

## Licence

MIT

---

## Autor

Dan - Učení DevOps & MLOps skrz praktické projekty

**Další Kroky:**
- [ ] Přidat ML pipeline pro predikci výdajů
- [ ] Přidat Prometheus + Grafana monitoring
- [ ] Přidat E2E testy s Playwright
- [ ] Přidat staging environment
