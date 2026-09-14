# Release checkpoint — 13 September 2026

## Source follow-up — 14 September 2026

- Implemented shared-evidence/missing-case consistency, inactive-login rejection, serialized custody transfers, safe unexpected JSON errors, fenced 15-second worker heartbeats, exact-key orphan cleanup, and durable graph reconciliation with saved-analysis reuse.
- Added migration `0004_job_leases`; fresh/repeated and revision-0003 SQLite upgrades pass. Reset export cleanup/both-case mirroring and active-job refusal are tested only in disposable fixtures.
- Added the opt-in, additive six-case/80-artifact synthetic bundle: 36 CSVs, 44 source notes, 2,000 calls and 500 transactions. ISO timestamps, hashes, schemas, seed determinism, citations, tampering/path rejection and repeat imports are validated; all CSV samples visually reviewed. See `docs/SYNTHETIC_DEMO_GUIDE.md`.
- New backend suite: **29 passed, 3 external opt-in tests skipped**. Repair/bundle tests additionally passed **15 tests on temporary PostgreSQL schemas**; graph/storage were mocked/filesystem in that isolated check. The two subsequently added migration tests target SQLite.
- Frontend follow-up: **8 unit tests passed**, TypeScript and production build passed with the compatible arm64 runtime. No frontend behavior was changed in this repair pass.
- These are source-level repairs, not a new full live Docker/browser release checkpoint. No live expanded import, reset, Git push, main merge or cloud publication was performed. The prior dated live results below remain historical.

## Implemented

### Detailed synthetic-data follow-up — 14 September 2026

- Generated the separate, opt-in `realistic-v2` pack: ten connected fictional investigations, 200 source artifacts, 5,000 calls, 1,500 transactions, 200 authored observations, 50 people, 15 vehicles, 20 accounts, ten organizations and 15 public locations.
- Added explicit fictional inventory/observation analysis, coordinate-backed source events, source-derived media metadata, matching fictional custody handovers and same-byte import hashing. Boundary-aware alias matching prevents larger transaction amounts from producing unrelated demo account entities.
- Final offline import/read-model checks validate 200 artifact hashes, all citations, 11,700 relationships, 6,700 timeline events, 5,200 map events, 90 alerts, 20 bilingual HTML previews and 20 Copilot examples. All 80 CSV samples and ten source PDFs were visually inspected. See `docs/REALISTIC_SYNTHETIC_DATA.md`.
- This pack was not loaded into the running demo, published, mirrored to the live Neo4j service or anchored on-chain. Credentials were not read or used. Large-case browser performance and actual operational report/registration history require a separate live release check.
- Latest full backend regression: **31 passed, 3 external opt-ins skipped** in 164.59 seconds. The earlier PostgreSQL/frontend checks remain separately dated and do not certify a deployed rich pack.

- Case-scoped routed investigation workspace, including empty newly created cases, shared cited evidence for Northbridge, URL filters and browser history.
- Streamed SHA-256 intake/storage/download, incoming multipart body limits, content signatures, safe names/UUID IDs and duplicate cleanup.
- Structured CDR/financial extraction, supported events/coordinates/relationships/alerts, exact-hash synthetic media captions (not speech/vision recognition), atomic Neo4j mirroring.
- Live contract integrity checks, real receipt recovery after interrupted responses/database-only resets, restart-safe deployment, role-gated anchoring, custody transitions and opaque QR identity lookup.
- English/Hindi routed UI, scoped Copilot citations, HTML previews, stored report history, bilingual downloadable PDFs and honest static showcase reports.
- Refresh-token rotation, concurrent secure-preview refresh, access-token logout revocation, consistent JSON errors, bounded worker lease recovery/retry, readiness returning 503 when dependencies fail.
- Compose health ordering, separate Linux blockchain dependency volumes, migration upgrades and opt-in full integration/judging tests.

## Verified on this computer

- Backend regression suite and actual FastAPI → ethers → Hardhat receipt/tampering/recovery path.
- Solidity registration/retrieval/events/duplicate rejection/modified-hash tests.
- Frontend unit tests, TypeScript and production build.
- Showcase Playwright flows in desktop Chrome and mobile-sized Chrome; Hindi timeline screenshot inspected.
- Fresh SQLite Alembic upgrade to head and repeated idempotent upgrade. This is not a PostgreSQL migration verification.
- Local Compose PostgreSQL migrations/startup and readiness verified after fixing seed parent/child insertion ordering. SQLite now enforces foreign keys in regression tests.
- Actual Compose integration passed: synthetic CSV upload to MinIO, metadata in PostgreSQL, real Hardhat registration and hash verification, worker analysis and evidence-backed Neo4j mirroring. No reset or user data deletion was performed.
- Generated English/Hindi report artifacts rendered for visual inspection.

## Final local judging validation

The approved Docker restart recovered the earlier filesystem failure. The frontend was rebuilt cleanly and backend/worker report fixes deployed. Readiness checks for PostgreSQL, MinIO, Neo4j and blockchain all pass. Services with healthchecks are healthy; the worker is running and completed real jobs.

- Full-stack judging/control browser suite: **14 passed** across desktop and mobile-sized Chromium, including real upload, hash, storage, blockchain receipt, analysis, custody, tampering, QR, citations and bilingual reports.
- Separate showcase browser suite: **6 passed**, no invented anchors; temporary showcase server stopped.
- Backend: **12 passed**, 3 opt-in external tests skipped; frontend unit: **8 passed**; contract: **2 passed**; real non-reset Compose integration: **1 passed**, reset test deselected.
- TypeScript and production build passed. Four browser-downloaded PDFs, 18 pages each, were rendered and visually reviewed across all 72 pages. All seven seeded IDs and complete SHA-256 hashes were independently checked in each file.
- Map event grouping/citations, tile-failure handling, financial empty states, graph gestures, Copilot case-history isolation and Linux English/Hindi report fonts were repaired and regression-tested.

See [the control audit](CONTROL_AUDIT.md) for the matrix, rerun commands and boundaries. This verifies the local prototype slice, not production certification.

## Separately permission-gated or not certified

No live reset, data/volume deletion, Git push or cloud publication was performed. Synthetic audit cases/evidence/custody/report history remain. A clean isolated-demo reset and its destructive integration test require explicit approval. Hardhat's restart lost its ephemeral chain history while database/storage/graph volumes were retained; fresh final-run evidence was anchored and verified, and historical receipts are not fresh confirmations.

Mobile browser checks use a viewport, not a physical device. Safari/Firefox, comprehensive WCAG, PDF-UA tagging and full searchable Hindi PDF Unicode round-trip extraction are not certified. HTML previews remain available.

Vercel authentication exists, but the signed-in team has no Decypher project. A destination project/team or permission to create `decypher-by-epoch` is required before publishing; no unrelated existing project will be overwritten.

## Honest prototype boundaries

Optional paid AI/cloud S3/SQS adapters, production MFA, tenant/case-level access policies, large-scale streaming, OCR, advanced audio/video recognition and sophisticated anomaly algorithms are not represented as completed. PostgreSQL is authoritative; the graph is a mirror. QR identity lookup is not a byte-integrity check. Static showcase reports are synthetic and unanchored. Database reset does not erase chain history.
