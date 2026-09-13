# Release checkpoint — 13 September 2026

## Implemented

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
