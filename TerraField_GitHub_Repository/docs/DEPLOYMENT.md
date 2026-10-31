# Deployment preparation, not a verified deployment

No cloud account, hosted database, domain or deployment credentials were provided. No live URL exists. The architecture currently serves the frontend and API on the same origin; CORS is intentionally not enabled. A Node server is independently runnable. The Dockerfile is a packaging starting point, **not proof of production readiness** and has not been deployed or tested here.

For local-only container evaluation with Docker installed:

```sh
docker build -t terrafield .
docker volume create terrafield-data
docker run --rm -p 127.0.0.1:8000:8000 -v terrafield-data:/data terrafield
curl -f http://localhost:8000/api/health
```

For a hosted proof of concept, choose a host supporting Node 24 and a persistent writable volume; configure `DATABASE_PATH` on it, set `TERRAFIELD_HOST=0.0.0.0`, and route the **same HTTPS origin** to the application. Use a stable origin so browser-held report keys remain accessible. Configure backup and restore of the volume and secure key handling. Test health, actual save, restart and reopen on that exact deployment. A container's ephemeral filesystem is not sufficient. Confirm external-provider terms, permitted request volume, data privacy, backups and restore, TLS and rate limits before use. The current browser bearer key is not secure multi-user account authentication, has no recovery, and this application lacks production-grade abuse protection. Do not publicly deploy for private records without redesign/review. No frontend/backend URL can be documented until deployed and verified.
