# Pylos — Docker & Deployment

## Image bauen & lokal testen

```bash
docker build -t pylos:1.0 .
docker run -d --name pylos -p 8787:8787 pylos:1.0
# Frontend + API + SSE: http://localhost:8787/
# Health: curl http://localhost:8787/health
```

## Wichtig: 1 Replica

Der Server hält Partien im Speicher (`src/server/store.ts`). Bei mehr als
einem Pod gingen Raum-Zuordnungen verloren → Deployment immer mit
`replicas: 1` betreiben. Partien sind flüchtig: Container-Restart =
laufende Partien weg (Reconnect-Fenster läuft serverseitig ab).

## Kubernetes

- Lokaler Test: k3d-Cluster `gitops-playground` (kubectl current context).
- Manifeste: Helm-Chart unter `deploy/pylos` (Ticket #380).
- Produktion: Oracle Free Tier + k3s, siehe ADR `adr-pylos-hosting-evaluierung`.

### k3d-Deployment (lokal)

```bash
docker build -t pylos:1.0 .
k3d image import pylos:1.0 -c gitops-playground
helm upgrade --install pylos deploy/pylos -n pylos --create-namespace \
  --set nodePort=30080 --set ingress.enabled=false
kubectl -n pylos get pods          # → Ready 1/1
# Zugriff: NodePort ist hostseitig nicht direkt gebunden → Port-Forward:
kubectl -n pylos port-forward svc/pylos 30081:8787
# Spiel: http://localhost:30081/  (zwei Browser gegeneinander)
```

## Container-Layout

- Multi-Stage: `npm ci` → `vite build` + esbuild-Bundle (`server.cjs`)
- Runtime: `node:22-alpine`, non-root (`USER node`), PORT 8787,
  `STATIC_DIR=/app/dist`, HEALTHCHECK auf `/health`, SIGTERM-Shutdown.
