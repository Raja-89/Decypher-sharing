# Decypher by Epoch

A fictional, investigator-controlled full-stack prototype. Operation Nightfall connects synthetic evidence, cryptographic identity, custody, a local blockchain registry, graph exploration and evidence-cited answers. This is not an official government service or a production forensic system.

The 14 September backend repairs and separate six-case/80-artifact synthetic pack are documented in [the demo guide](docs/SYNTHETIC_DEMO_GUIDE.md). The pack is not loaded automatically and contains no invented blockchain confirmations. See [backend implementation](docs/BACKEND_IMPLEMENTATION.md) for technical details and dated validation boundaries.

## Local secure demonstration

The newer [detailed synthetic pack](docs/REALISTIC_SYNTHETIC_DATA.md) includes ten connected fictional investigations, 200 mixed-format artifacts, 5,000 calls and 1,500 transactions. It is opt-in and does not change the running demo automatically.

Requirements: Docker Desktop running with Docker Compose, and internet access for first-time image/package downloads.

```sh
cp .env.example .env
docker compose up --build
```

Open http://localhost:8443. If another frontend occupies port 8443, stop it first. API docs: http://localhost:8000/docs. Neo4j browser: http://localhost:7474. MinIO console: http://localhost:9001.

Demo accounts use password `DemoAccess2026!`:

- `investigator@decypher.example`: cases, upload, analysis, reports
- `supervisor@decypher.example`: senior role, including registration
- `forensics@decypher.example`: evidence analysis and registration
- `admin@decypher.example`: all permissions and demo reset

Quick-fill accounts are available on the login screen. Open `/demo` for the guided sequence. Register evidence as forensics, supervisor or admin; the investigator role intentionally cannot anchor evidence.

The API uses PostgreSQL, Alembic and JWTs. Evidence is hashed before MinIO storage. Only hash/identity metadata enters `EvidenceRegistry.sol`. The ethers bridge waits for a real Hardhat receipt. Queued analysis/report jobs are processed by the worker. Graph relationships include evidence IDs, timestamps and confidence. Neo4j is a mirror; PostgreSQL remains the source of truth.

Detailed backend architecture, data model, API inventory, permissions, processing, validation and remaining limits: [Backend implementation](docs/BACKEND_IMPLEMENTATION.md).

Admin reset reseeds the database/graph. It cannot erase blockchain history. For a fully fresh ephemeral blockchain, stop and recreate the Hardhat/deployment/bridge services. Never use this demo key material or passwords in production.

## Showcase mode

```sh
pnpm install --frozen-lockfile
npm run dev
```

The default mode is `showcase`. It provides routes, browser history, synthetic media, maps, graph exploration, local SHA-256 hashing and cited story answers. Uploads are browser-only and not persisted. Blockchain actions explicitly require the local secure service; no fake transactions or block confirmations are created. English/Hindi HTML previews and full synthetic investigation PDFs are built from the same seeded case snapshots. Operation Northbridge shares only its cited field note; new local cases start empty rather than inheriting the Nightfall graph.

Set `VITE_APP_MODE=full` and `VITE_API_URL=http://localhost:8000/api/v1` when using the backend. Vercel uses `vercel.json` for SPA deep links; use showcase mode unless a reachable secure API is deliberately configured.

## Synthetic evidence

`data/demo` and `public/demo` contain the FIR PDF, CDR CSV, financial CSV, investigation note, dispatch transcript, generated CCTV still, six-second still-based MP4 and six-second synthetic radio-tone WAV. These are all fictional. The clip is not computer-vision analysis and the tone is not speech. QR codes target localhost for local judging; hosted visitors can use the verification link.

## Checks

```sh
npm test
npx tsc --noEmit
npm run build
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
PYTHONPATH=backend .venv/bin/pytest -q backend/tests
cd blockchain
npm ci
npm test
```

Tests cover bounded hashing/tampering, content signatures, authentication rotation/logout, case isolation, scoped citations, custody transitions, worker recovery and bilingual report jobs. Contract tests cover registration, lookup, events, duplicate rejection and modified hashes. Playwright covers protected routes, browser history, Hindi persistence, case selection, citation navigation, QR identity and report downloads at desktop/mobile sizes.

```sh
pnpm exec playwright install chromium --only-shell
# Showcase assertions need a separate showcase-mode server:
npm run test:e2e:showcase
# Non-destructive integration check against the healthy local Docker demo:
DECYPHER_INTEGRATION=1 PYTHONPATH=backend .venv/bin/pytest -q backend/tests/test_integration.py -k storage_chain_graph_and_job_pipeline
npm run test:e2e:full
docker compose ps
curl --fail http://localhost:8000/ready
```

The full browser command includes the judging slice and expanded desktop/mobile control audit. Recorded results and validation boundaries are in [docs/CONTROL_AUDIT.md](docs/CONTROL_AUDIT.md). The live browser suite blocks the demo-reset endpoint; it adds synthetic audit cases/evidence, without deleting existing records. To test an actual reset, obtain explicit approval for an isolated demo before setting `DEMO_RESET_ALLOWED=1`. The local frontend mounts `src` and `public` read-only for source reloads, retaining container-owned dependencies.

`/health` is process liveness; `/ready` returns 503 unless database, storage, Neo4j and the deployed blockchain bridge are reachable. Failed jobs can be retried through `POST /api/v1/jobs/{id}/retry` up to three attempts. Abandoned worker leases are recovered after five minutes. Uploads hash and spool in bounded chunks, then stream to MinIO; analysis may read the accepted artifact into memory under the 100 MB cap. File download/preview streams bytes and refreshes expired sessions.

Build showcase artifacts after changing the seed/analyzer: `npm run demo:build`. The generator uses an isolated temporary database, never the live investigation database. A database-only reset can recover an existing genuine receipt for the same hash/case/evidence identity; it does not fabricate or erase blockchain history.

## Prototype boundaries

- Deterministic analysis is implemented; paid AI, S3/SQS, OCR, advanced audio/video analysis and sophisticated anomaly algorithms are not complete adapters. Environment placeholders do not imply those integrations are active.
- Routed UI, validation/loading labels, story summaries, Copilot and report sections use the shared English/Hindi locale. Original source text, identity codes and user-entered content are preserved verbatim rather than machine-translated.
- Basic network summaries and seeded relationships are not a production intelligence model.
- Production MFA, tenant/case-level authorization, encryption key management, incident response and forensic certification are out of scope.
- Full Docker/PostgreSQL/MinIO/Neo4j integration and the secure full-stack E2E run require Docker Desktop and passed locally on 13 September 2026; see the dated audit for exact results. This does not establish cloud deployment, production security, physical-device or forensic certification.

Do not commit real AWS credentials or paid-provider keys. Revoke/rotate any previously exposed AWS access-key ID before cloud integration.
