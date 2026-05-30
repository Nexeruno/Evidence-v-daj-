# 🐳 Podman - Lokální vývoj a build

Tento projekt používá **Dockerfile** pro budování aplikace s Podman. Podman je bezpečnější alternativa k Dockeru (rootless, bez démona).

## 📋 Požadavky

- **Podman** (Windows/Mac/Linux) - [install.podman.io](https://podman.io/docs/installation)
- **Docker Compose** (volitelně) - pro orchestraci

## 🚀 Rychlý start

### 1. Build image
```bash
podman build -t evidence-vydaju:latest \
  --build-arg VITE_FIREBASE_API_KEY=your_firebase_api_key \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain \
  --build-arg VITE_FIREBASE_PROJECT_ID=your_firebase_project_id \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id \
  --build-arg VITE_FIREBASE_APP_ID=your_firebase_app_id \
  --build-arg VITE_ADMIN_EMAIL=your_admin_email@example.com \
  .
```

> Najdi skutečné hodnoty v `src/config/firebase-config.js` a GitHub Secrets!

### 2. Run container
```bash
podman run -d -p 8080:80 --name evidence-vydaju evidence-vydaju:latest
```

### 3. Open in browser
```
http://localhost:8080
```

### 4. Stop container
```bash
podman stop evidence-vydaju
podman rm evidence-vydaju
```

---

## 🛠️ Podrobný workflow

### Vývoj (s live reload)
```bash
# Lokálně s npm - rychlejší vývoj
npm install --legacy-peer-deps
npm run dev
```

### Build pro produkci
```bash
podman build -t evidence-vydaju:prod \
  --build-arg VITE_FIREBASE_API_KEY=your_key_here \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=your_domain_here \
  --build-arg VITE_FIREBASE_PROJECT_ID=your_project_id_here \
  --build-arg VITE_FIREBASE_STORAGE_BUCKET=your_bucket_here \
  --build-arg VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here \
  --build-arg VITE_FIREBASE_APP_ID=your_app_id_here \
  --build-arg VITE_ADMIN_EMAIL=your_email_here \
  .
```

> Nahraď placeholders skutečnými hodnotami z Firebase konzole!

### Test v kontejneru (jako produkce)
```bash
# Build
podman build -t evidence-vydaju:test -f Dockerfile .

# Run
podman run -it -p 8080:80 evidence-vydaju:test

# Test v prohlížeči
# http://localhost:8080

# Kontrola logů
podman logs evidence-vydaju
```

---

## 📊 Environment variables

Všechny `VITE_*` proměnné se předávají jako build argumenty:

```dockerfile
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
# ... atd
```

```bash
podman build \
  --build-arg VITE_FIREBASE_API_KEY=value \
  --build-arg VITE_FIREBASE_AUTH_DOMAIN=value \
  .
```

---

## 🔍 Debugging

### Podívat se do kontejneru
```bash
podman exec -it evidence-vydaju sh
```

### Kontrola logů
```bash
podman logs evidence-vydaju
podman logs -f evidence-vydaju  # real-time
```

### Health check
```bash
podman ps
# HEALTHCHECK column ukazuje stav
```

---

## 🚢 Deployment (volitelně)

### Na Kubernetes (k3s, minikube)
```bash
# Export image
podman save evidence-vydaju:latest | gzip > evidence-vydaju.tar.gz

# Import na serveru
podman load < evidence-vydaju.tar.gz
```

### Na Docker Hub
```bash
podman login docker.io
podman tag evidence-vydaju:latest docker.io/yourusername/evidence-vydaju:latest
podman push docker.io/yourusername/evidence-vydaju:latest
```

---

## 📈 Optimizace

### Multistage build (již v Dockerfile)
- **Builder stage**: Node.js pro build
- **Runtime stage**: nginx alpine (33 MB vs 1 GB full Node)

### Caching
- npm packages cachují se v layerech
- Statické assety mají `expires 1y`
- HTML nikdy se cachuje

---

## 🔐 Bezpečnost

✅ **Rootless** - Podman běží bez root práv (na rozdíl od Dockeru)
✅ **Security headers** - X-Frame-Options, CSP, atd.
✅ **Gzip** - komprese odpovědí
✅ **Health check** - automatické kontroly

---

## ❓ FAQ

**Q: Jak updateju image po změně kódu?**
```bash
podman build -t evidence-vydaju:latest .
podman stop evidence-vydaju
podman rm evidence-vydaju
podman run -d -p 8080:80 --name evidence-vydaju evidence-vydaju:latest
```

**Q: Jak se dostanem do kontejneru?**
```bash
podman exec -it evidence-vydaju sh
```

**Q: Jak resetuju vše?**
```bash
podman stop evidence-vydaju
podman rm evidence-vydaju
podman rmi evidence-vydaju:latest
```

**Q: Funguje to na Windowsu?**
Ano! Podman Desktop na Windows (WSL 2) funguje.

---

## 🎯 Příští kroky

1. ✅ Dockerfile pro produkci
2. ✅ nginx config se security headers
3. ⏭️ docker-compose.yml (pro multi-container setup)
4. ⏭️ Kubernetes manifesty (volitelně)
5. ⏭️ CI/CD s Podman (GitHub Actions)

---

**Nápověda**: `podman --help` a `podman build --help`
