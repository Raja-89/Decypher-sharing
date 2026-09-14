# Decypher by Epoch — Backend Implementation

Detailed implementation inventory and technical handoff, updated **14 September 2026**.

### 14 September repair checkpoint

The new source repairs add shared-evidence consistency across case reads, explicit missing-case errors, inactive-login rejection, serialized competing custody transfers, safe unexpected JSON errors, renewable fenced worker leases, durable exact-object cleanup, and durable graph-reconciliation jobs. Analysis is saved before Neo4j synchronization; retry reuses that saved analysis. Reset removes managed report exports, mirrors both classic cases, and refuses while jobs are queued/running. Migration `0004_job_leases` adds the ownership token.

The expanded synthetic bundle is separate from startup seeding: **6 new cases, 80 CSV/text artifacts, 2,000 calls and 500 transactions**. Validation and explicit additive loading are documented in `docs/SYNTHETIC_DEMO_GUIDE.md`. Loading does not anchor evidence or reset existing records. Spreadsheet-authored CSVs preserve source IDs and ISO timestamps; file hashes/schema/counts and repeat imports are checked.

These source changes are newer than the 13 September live Docker/browser checkpoint below. Do not treat that historical browser run as validation of newly deployed repair images. No expanded live import or live reset was performed for this checkpoint.

Current validation: **29 backend tests passed, 3 external opt-ins skipped**; **15 repair/bundle tests passed on disposable PostgreSQL schemas** (two additional migration tests target SQLite); **8 frontend unit tests passed**, TypeScript checks and the production frontend build passed. Import fixtures use filesystem storage and mocked graph synchronization. These are not new live MinIO/chain/Neo4j browser results.

## 1. Scope and current status

### Detailed-data follow-up — 14 September 2026

The optional `data/demo/realistic-v2` pack adds **ten distinct investigations and 200 actual source artifacts**, with 5,000 calls, 1,500 transactions, 200 explicitly authored source observations, entity inventories and staged media. It remains separate from the classic startup seed and the smaller six-case pack; no live import/reset or cloud credentials were used. See [the detailed data guide](REALISTIC_SYNTHETIC_DATA.md) for source-fidelity boundaries and additive loading.

The loader recognizes explicit fictional inventory/observation schemas, loads inventories before coordinate-backed calls, records two fictional custody handovers, preserves existing entity properties and rechecks source bytes before storage/analysis. Entity lookup is indexed before alias fallback, and demo heuristic aliases require word boundaries to avoid inventing an account from digits embedded in a transaction amount. All relationships and extracted events remain evidence-cited. New entity/observation support does not imply computer vision, speech recognition or calibrated guilt classification.

Final disposable read models contain 11,700 relationships, 6,700 timeline events, 5,200 map events and 90 alerts, with 20 bilingual HTML previews and 20 Copilot examples. All citations and 200 source hashes are checked; all CSV samples and ten source PDFs were visually inspected. Live large-case performance, repaired Docker images and actual MinIO/Neo4j/contract integration remain a separate release checkpoint.

Latest full backend run: **31 passed, 3 external opt-ins skipped** in 164.59 seconds, including the rich-pack stored hashes/idempotency/custody coverage and alias-boundary regression. The earlier 15-test disposable PostgreSQL check and frontend checks above predate these rich-pack additions; they are not a new live integration result.

The backend implements the local full-stack investigation prototype: case creation, evidence intake, hashing, object storage, blockchain registration, analysis, graph mirroring, custody, verification, cited Copilot answers and bilingual reports.

The validated vertical slice is:

```text
Authenticated case
  → multipart evidence upload
  → SHA-256 + validated metadata
  → MinIO original + PostgreSQL record
  → explicit registration through ethers/Hardhat
  → opaque QR identity
  → queued deterministic analysis
  → PostgreSQL findings + Neo4j mirror
  → case graph/timeline/map/network + cited Copilot
  → live integrity verification
  → queued English/Hindi HTML and PDF reports
```

This document describes branch `dev`, based on application commit `f6babb9` plus the uncommitted 14 September repairs. The separately fetched, newer `origin/main` changes were **not merged into this implementation**. Incoming main-branch AI/search changes must not be mistaken for features implemented and validated here.

The backend is a **working local prototype**, not a production forensic or government service. The most recent recorded checks show the required local dependencies ready and the real upload/storage/chain/graph pipeline passing. Detailed browser results are recorded in `docs/CONTROL_AUDIT.md`.

No real AWS credentials, paid AI keys or private production wallet material are required for this local workflow. Development defaults and public Hardhat test identities are not safe production credentials.

## 2. Technology and architecture

| Component | Implemented responsibility |
| --- | --- |
| Python 3.10 container | Backend and processing-worker runtime |
| FastAPI 0.115.12 / Uvicorn 0.34.3 | HTTP API, multipart intake, dependency-based authentication, OpenAPI |
| SQLAlchemy 2.0.41 | Relational persistence, sessions, queries and row locks |
| Alembic 1.16.1 | Schema upgrade chain |
| PostgreSQL 16 | Authoritative local Compose investigation database |
| SQLite | Non-Compose development and backend regression database |
| Pydantic / pydantic-settings | Request validation and environment-based configuration |
| PyJWT / pwdlib with Argon2 | Signed sessions and password hashing |
| MinIO client 7.2.15 | Local S3-compatible evidence/report object storage |
| Neo4j 5 Community / driver 5.28.1 | Case-scoped graph mirror |
| Solidity 0.8.28 / Hardhat / ethers | Real local EVM evidence registry and transaction receipts |
| Express bridge | Python-to-EVM registration and lookup interface |
| Database-backed Python worker | Analysis/report queue, claims, failure and retry handling |
| qrcode / Pillow | PNG verification QR generation and image metadata |
| pypdf | Text extraction from supported PDFs |
| ReportLab 4.4.1 / uharfbuzz 0.51.0 | Paginated PDFs and Hindi text shaping |

Python dependency versions are pinned in `backend/requirements.txt`. Backend and worker share the same image and environment. The worker is a separate process, not a FastAPI background task or an external SQS consumer.

### Source-of-truth boundaries

- PostgreSQL stores identities, investigation state, evidence references, jobs, custody and saved receipts.
- MinIO stores originals and generated artifacts. Evidence files are not placed on-chain.
- The EVM contract stores hashes and identity metadata only.
- Neo4j mirrors the case snapshot. Browser graph data is served from relational read models, not directly queried from Neo4j.
- Graph replacement is transactional within Neo4j; PostgreSQL, Neo4j, MinIO and EVM writes are **not** one distributed transaction.

## 3. Configuration, infrastructure and startup

`backend/app/config.py` loads environment variables through `Settings`, with `.env` support. `.env.example` is the configuration template; secret values must stay outside Git.

| Setting group | Supported fields / behavior |
| --- | --- |
| Application | `APP_NAME`, `ENVIRONMENT`, `FRONTEND_URL`, `PUBLIC_BASE_URL` |
| Database | `DATABASE_URL`; SQLite default outside Compose, PostgreSQL in Compose |
| Sessions | `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_MINUTES`, `REFRESH_TOKEN_HOURS` |
| Storage | `STORAGE_PROVIDER`, `STORAGE_PATH`; implemented providers are filesystem and MinIO |
| MinIO | Endpoint, access/secret keys, bucket and TLS flag |
| Graph | `NEO4J_URI`, user and password |
| Blockchain | Backend bridge URL; Node services use RPC URL, deployment path and optional test-wallet override |
| Upload limit | `MAX_UPLOAD_BYTES`, default 104,857,600 bytes: 100 MiB, labelled 100 MB in prototype messages |
| Future cloud/AI | AWS region/key/bucket/queue and OpenAI key fields exist, but are not operational adapters |

An arbitrary `STORAGE_PROVIDER=s3` does not activate AWS S3; only the explicit MinIO branch creates an object-storage client. Configure only implemented provider values.

### Compose services

| Service | Role and local exposure |
| --- | --- |
| `postgres` | Database; host port 5432, persistent `postgres_data` |
| `neo4j` | Graph; browser 7474 / Bolt 7687, persistent `neo4j_data` |
| `minio` | Object API 9000 / console 9001, persistent `minio_data` |
| `minio-init` | Idempotent bucket preparation; successful exit is expected |
| `hardhat` | Local RPC on 8545; in-memory chain, separate Linux dependency volume |
| `blockchain-deploy` | Compile/deploy/reuse registry; successful exit is expected |
| `blockchain-bridge` | Internal port 8787, waits for deployment |
| `backend` | API on 8000, waits for required dependencies |
| `worker` | Processing loop, starts after backend health; no independent container healthcheck |
| `frontend` | Local judging UI on 8443, full API adapter, source/public mounted read-only |

Hardhat, deployment and bridge use separate dependency volumes to avoid host/container native-module collisions. The RPC healthcheck explicitly uses IPv4 and verifies local chain ID 31337.

The backend Docker command runs `alembic upgrade head` before Uvicorn. FastAPI startup additionally creates missing metadata tables, idempotently seeds the demo and attempts to mirror Nightfall and Northbridge. Seed parents are flushed before foreign-key children; existing seed IDs are retained rather than recreated on every startup.

The backend code is copied into its image: backend source changes require an image rebuild/recreation. Frontend source mounts do not imply backend hot reload.

### Schema revisions

| Revision | Implementation |
| --- | --- |
| `0001_initial` | Creates ORM metadata tables |
| `0002_job_attempts` | Adds attempt accounting to pre-existing job tables if missing |
| `0003_evidence_case_links` | Creates shared-evidence case association table if missing |
| `0004_job_leases` | Adds renewable processing-job ownership tokens if missing |

The initial migration imports current ORM metadata rather than a frozen, explicit historical schema. This works for the prototype but is not a mature production migration strategy. PostgreSQL startup migrations and repeated SQLite upgrades were validated; all downgrade paths and upgrades from arbitrary historical schemas are not certified.

## 4. Persisted data model

There are **16 relational model tables** in `backend/app/models.py`.

| Table | Stored data and purpose |
| --- | --- |
| `users` | ID, unique email, name, role, password hash, active flag and creation timestamp |
| `refresh_tokens` | Token JTI, user FK, expiry and revocation flag |
| `cases` | Unique case number, English/Hindi title/description, status, priority, lead investigator and timestamps |
| `evidence` | Primary case/user FKs, filename/description/type, object key, MIME, size, unique SHA-256, status, unique verification token and timestamps |
| `custody_events` | Evidence FK, event, from/to actors, location, notes and timestamp |
| `evidence_case_links` | Unique evidence/case pair for shared artifacts |
| `evidence_analyses` | Evidence FK, provider, summary, confidence, structured result and creation time |
| `entities` | Canonical English/Hindi name, type, aliases and property JSON |
| `evidence_entities` | Evidence/entity FKs, confidence and source excerpt |
| `relationships` | Case/source/target FKs, directed type, confidence, evidence IDs and timestamp |
| `timeline_events` | Case FK, timestamp/type, bilingual title, description, entity/evidence IDs, location JSON and confidence |
| `alerts` | Case FK, title/reason, confidence, supporting evidence IDs and status |
| `blockchain_anchors` | Unique evidence/hash/transaction references, network, contract, block, actor and saved registration timestamp |
| `reports` | Case/user FKs, locale, object key and generation time |
| `processing_jobs` | Kind/target, state, progress, options/result JSON, error, attempts and timestamps |
| `audit_log` | User/action/target, metadata and timestamp; also used for access-token revocation |

Evidence UUID-based IDs use the `EV-` prefix; created cases use `CASE-`, queued jobs `JOB-` and generated reports `RPT-`. Seeded objects have stable story IDs. Entity/relationship/event IDs derived during extraction use deterministic SHA-256-based identifiers.

Evidence hashes are **globally unique**, not merely unique per case. Uploading identical bytes into another case is rejected; shared evidence is represented by `evidence_case_links`. The shared-link model is seeded/used internally, but there is no general-purpose public linking endpoint yet.

SQLite connections enforce foreign keys. SQLAlchemy sessions are created per request and closed after use; connection pre-ping is enabled.

## 5. Authentication and role permissions

### Implemented session behavior

- Login validates the email/password and checks the stored Argon2 password hash.
- JWTs include subject, role, token type, unique JTI and expiry; HS256 is the default.
- Default access lifetime is 30 minutes; refresh lifetime is 24 hours, both configurable.
- Refresh records are persisted; refreshing locks the record, revokes the old token and creates a new pair.
- Protected requests verify token type/expiry, load the current active user and check access-token revocation.
- Logout revokes the supplied refresh token belonging to that user and records revocation of the current access JTI.
- Role decisions use the current database user, not just a client-provided role.
- CORS allows the configured frontend and documented localhost development origins.

Login rejects inactive users before issuing tokens; protected access and refresh also reject inactive users. This is not a production account-management workflow.

### Current role matrix

`senior` is the supervisor role. A dash means the route denies that role.

| Operation | Investigator | Senior | Forensics | Admin |
| --- | --- | --- | --- | --- |
| Read cases/evidence/graph/jobs/reports; verify bytes; query Copilot | Yes | Yes | Yes | Yes |
| Create case | Yes | Yes | — | Yes |
| Upload evidence / queue analysis | Yes | Yes | Yes | Yes |
| Register evidence / record custody / retry failed job | — | Yes | Yes | Yes |
| Queue report | Yes | Yes | — | Yes |
| Read audit log | — | Yes | — | Yes |
| Reset demo | — | — | — | Yes |

Role permissions are implemented; tenant membership and per-case user assignments are **not**. Any active authenticated user can read the prototype's cases/evidence. Demo accounts and a public quick-fill/account endpoint are intentional local-demo conveniences, not production authentication.

## 6. Evidence intake, hashing and storage

`POST /api/v1/evidence` accepts multipart `case_id`, optional `description` and `file`. Upload does **not** automatically register or analyze evidence: those are explicit subsequent actions.

### Intake sequence

1. Check the upload role and case existence.
2. Check the declared MIME against the closed allowlist.
3. Hash the spooled file in 64 KiB chunks, enforce size and reject empty bytes.
4. Validate supported content signatures/structure.
5. Reject an existing identical hash.
6. Generate an opaque evidence UUID and sanitize the filename.
7. Stream the accepted file into storage.
8. Persist the evidence record, COLLECTED/HASHED custody entries and upload audit record.
9. Return real evidence ID, hash, size, MIME, status and verification token.

Object keys follow:

```text
raw/case/{case_id}/{evidence_id}/original/{safe_filename}
```

Filename sanitization strips both Unix/Windows directory components, removes unsafe characters and caps the retained name at 180 characters. The database hash uniqueness constraint also handles concurrent duplicate uploads; duplicate-related persistence failures remove the newly written object.

### Allowed upload formats

| Format | MIME / implemented validation |
| --- | --- |
| PDF | `application/pdf`; `%PDF-` signature |
| Plain text | `text/plain`; UTF-8 prefix without NUL bytes |
| CSV | `text/csv`, `application/csv`; valid UTF-8 prefix and comma-containing first line |
| PNG / JPEG | `image/png`, `image/jpeg`; format signatures |
| WAV | `audio/wav`, `audio/x-wav`; RIFF/WAVE header |
| MP3 | `audio/mpeg`; ID3 or MPEG frame prefix |
| MP4 | `video/mp4`; `ftyp` container signature |
| DOCX | Standard Word OpenXML MIME; ZIP contains `word/document.xml`, declared expanded archive size within cap |

The validator examines an 8 KiB prefix except for DOCX structure. These checks are not a full codec/parser validation, malware scan, archive sandbox or forensic authenticity assessment. XLSX, arbitrary ZIPs and unsupported MIME types are not accepted.

An ASGI middleware bounds POST bodies under the evidence API before Starlette can spool an oversized multipart body: file limit plus 1 MiB envelope, checking both Content-Length and received chunks. This is bounded spooled intake followed by streaming hashing/storage, not a direct never-spooled network-to-MinIO pipeline.

### Storage abstraction

`Storage` implements `ensure`, byte `put`, streamed `put_file`, streamed `chunks`, byte `get`, object `remove` and prefix deletion. MinIO connections are closed/released after reads; filesystem mode uses the same logical keys.

Authenticated file previews/downloads stream 64 KiB chunks and return the stored MIME, sanitized inline filename and `X-Content-Type-Options: nosniff`. Originals are not exposed through a public bucket or unauthenticated file endpoint. HTTP range/large-media seeking, resumable uploads, lifecycle policies and production encryption/key management are not implemented.

Analysis reads the accepted artifact into memory under the cap; generated PDFs and PDF downloads also use in-memory byte buffers. Therefore the whole backend must not be described as constant-memory processing.

## 7. Blockchain registry, bridge and integrity verification

### Contract

`EvidenceRegistry.sol` stores a mapping keyed by a 32-byte SHA-256 digest. A record contains the digest, case ID, evidence ID, block timestamp, registering identity and existence flag.

Implemented functions:

- `registerEvidence`: rejects duplicate hashes, stores metadata and emits `EvidenceRegistered`.
- `getEvidence`: retrieves a record, rejecting unknown hashes.
- `isEvidenceRegistered`: returns existence.

No evidence file, case narrative, AI finding or original document text is placed on-chain. Registration is a provenance anchor, not a guarantee that the submitted evidence was authentic before intake.

The contract has no owner/role restriction: anyone able to submit an EVM transaction can call it. The local API role check protects the intended workflow, not direct RPC use. `registeredBy` is an application-supplied identity string, not a cryptographic signature by the investigator. The bridge uses a shared public Hardhat test wallet.

### Bridge and deployment

The internal Express bridge implements `/health`, `POST /register` and `GET /evidence/:hash`. It validates 64-character hexadecimal hashes and bounded opaque IDs, sends real ethers transactions, waits for mining and returns the genuine network/contract/transaction/block values. A nonce manager handles the signing wallet.

For a hash already registered to the same case/evidence identity, it retrieves the actual registration event and returns the original receipt. Different identity ownership returns a conflict. This supports recovery after an interrupted response or lost database receipt without fabricating a second transaction.

Deployment reuses a saved contract only when live deployed bytecode matches the expected registry; otherwise it deploys again. Bridge readiness verifies deployed code is present. Hardhat is ephemeral: restarting it can lose history even while database/storage volumes survive.

### API registration

Before registration the backend locks the evidence row and rehashes stored bytes. Modified bytes are refused. New successful receipts are saved in `blockchain_anchors`, evidence registration state/time is updated, and custody/audit entries are added.

When an anchor already exists, the route checks live evidence/case identity and contract address before returning it. The detailed proof endpoint also distinguishes `not_registered`, `confirmed`, `chain_unavailable` and `chain_mismatch`. Saved receipts are not silently treated as live confirmations after a chain reset.

### Verify states

`POST /api/v1/evidence/{evidence_id}/verify` either rehashes the stored original or hashes an optional comparison upload. It compares the result with the saved digest and, when an anchor exists, checks live evidence/case/hash/contract identity.

| State | Meaning |
| --- | --- |
| `MODIFIED` | Current/comparison bytes do not match the saved hash |
| `NOT_REGISTERED` | Bytes match but no saved blockchain anchor exists |
| `CHAIN_UNAVAILABLE` | Bytes match; a saved anchor exists but live lookup failed |
| `CHAIN_MISMATCH` | Bytes match; saved anchor cannot be matched to the live record |
| `VERIFIED` | Bytes match and the live contract identity matches the saved anchor |

The response includes `currentHash`, `registeredHash`, `hashMatch`, `blockchainMatch` and `checkedLiveContract`. Here `checkedLiveContract` indicates an anchor-triggered lookup was attempted; it does not prove the lookup succeeded. Verification adds custody/audit records. It is not a legal admissibility or chain-finality certification.

## 8. QR evidence identity

New evidence uses `secrets.token_urlsafe(32)` for an opaque verification token. A generated PNG QR contains:

```text
{PUBLIC_BASE_URL}/verify/{verification_token}
```

The authenticated QR endpoint returns an actual PNG; the public identity API resolves the token to limited evidence metadata and, if confirmed live, a transaction reference. Unknown tokens return 404. Public states are `ANCHORED`, `CHAIN_UNAVAILABLE` and `NOT_REGISTERED`; the public route does not expose a distinct chain-mismatch state.

The public endpoint does not return the original file or custody history and does not rehash stored bytes. Scanning a QR therefore identifies an anchored record, **not** proof that a presented file's current bytes match it. Use authenticated Verify for byte integrity.

Seed tokens are stable, predictable demo identifiers rather than production-strength opaque tokens. The ordinary new-upload flow creates random tokens. The holographic visual treatment belongs to the frontend; the backend generates a normal PNG QR, not a physical anti-counterfeit hologram.

## 9. Deterministic analysis and entity resolution

Analysis is implemented in `analysis.py` and `services.py`, and persists results rather than simulating a loading animation.

### Supported extraction

- PDF text via pypdf; DOCX document XML text; UTF-8 plain text and CSV.
- Text/document extraction is capped at 200,000 characters where implemented; CSV processing allows up to 10,000 rows.
- Known story entities/aliases and Indian phone patterns are recognized deterministically.
- Entity resolution normalizes whitespace and case, considers type and known aliases, reuses canonical entities, and generates stable IDs for new entities.
- Evidence/entity bindings retain confidence and a source excerpt, capped at 1,500 characters.
- Generated relationship/event IDs include their evidence identity, so retrying extraction does not recreate the same deterministic records.

### CDR schema

Recognized columns: `caller`, `receiver`, `start_time`. Optional story columns include `record_id`, `tower_location` and `source_note`.

Processing creates phone-to-phone CALLED relationships, source-note-supported person/phone bindings, known tower-location links and cited CALL events. Personal phone ownership is only added when the supported name appears in the source note; the hard-coded demo phone mapping is not an authoritative subscriber lookup. Tower coordinates come from the closed Delhi NCR location mapping, not live geocoding/GPS tracking.

### Financial schema

Recognized columns: `timestamp`, `from_entity`, `to_account`, `amount_inr`; optional `transaction_id`.

Processing creates person/account entities, TRANSFERRED_TO edges and cited TRANSACTION events. Amounts must be finite and non-negative; structured timestamps require timezone information. Transfers at or above INR 200,000 create a cited manual-review alert. This is a **synthetic demonstration threshold**, not a regulatory rule or conclusion of wrongdoing.

Invalid structured rows fail the job rather than silently producing a successful partial analysis.

### Media and cross-case notes

- Images expose width/height/format; WAV exposes duration/sample rate/channels.
- Other supported audio/video exposes byte metadata and an explicit no-recognition notice.
- Only exact hashes of the curated CCTV still/MP4/WAV fixtures receive curated vehicle/location captions, cited CAPTIONED_AT relationships and sighting events.
- A supported source note mentioning Vikram, vehicle V001 and Northbridge generates cited mention relationships, an event and review alert. Additional supported note mentions contribute vehicle V002/Noida links.
- Only the exact curated note has a known story occurrence timestamp; other matching uploaded notes explicitly use intake time for the cross-case event.

Results contain `entities`, `metadata`, `findings` and `sourceEvidenceId`. Findings contain actual supporting evidence IDs. Provider is currently `deterministic`; confidence values are rule/demo values, not calibrated model probabilities. Analysis saves an ANALYZED custody event but does not independently perform the full live-chain verification first.

OCR, transcription, face/vehicle recognition, arbitrary schema discovery and paid-model extraction are **not implemented**. Seeded narrative relationships are curated story assertions, distinct from newly derived extraction records.

## 10. Case snapshot, graph, timeline, map and network

`snapshot.py` supplies the shared case-scoped read model for the frontend, report builders, Neo4j mirroring and Copilot citation validation.

It collects primary and explicitly shared evidence, bound entities, directed relationships, timeline, alerts, custody, anchors and report history. Relationships, timeline records and alerts require nonempty supporting IDs wholly within the case's evidence set.

### Neo4j mirror

- Case-scoped nodes use `Entity` plus a closed type label: Person, Vehicle, Location, Account, Phone, Investigation or Other.
- Nodes store ID, case ID, canonical name, type, property JSON and evidence IDs.
- Edges are directed `RELATED` relationships. Domain type is an edge property, alongside ID, confidence, timestamp and supporting evidence IDs.
- A single Neo4j write transaction replaces the selected case mirror; other case nodes are retained.
- Startup mirroring is best effort. MinIO-mode analysis requires a successful mirror before the job succeeds.

The graph is a mirror, not an independent source of investigative truth. There is no GDS/APOC dependency, arbitrary Cypher API or guaranteed cross-database atomic commit. A Neo4j transaction can succeed before a later relational commit fails; retry/reconciliation remains important.

### Investigation read endpoints

Graph responses provide labels, properties, evidence counts, directed edge types, confidence, citations and timestamps. Timeline returns timestamped events. Map returns events that have location metadata. Related cases are computed by intersecting snapshot entity IDs and return shared entities/evidence.

Network analysis computes degree counts and ranks connected entities; three or more connections receives a descriptive classification. The special `bridgeEntities` list currently recognizes seeded `PERSON-P004`, rather than implementing a generic mathematical bridge/articulation algorithm. Metrics identify review leads, not guilt.

Graph/timeline/map use the shared snapshot; case-filtered evidence lists include primary and explicitly shared artifacts. Case-scoped collections, report reads and related-case queries explicitly return `case_not_found` 404 for unknown cases.

## 11. Chain of custody and audit records

Automatically recorded custody events include COLLECTED, HASHED, REGISTERED, ANALYZED, VERIFIED and VERIFICATION_CHECK. Authorized manual events are TRANSFERRED, RECEIVED, REVIEWED, SEALED and RELEASED.

Implemented transition checks:

- A transferred/released item must be received before another operation in the manual transition flow.
- RECEIVED requires a prior transfer/release.
- A sealed item's permitted next manual actions are transfer, release or review.
- A recipient is required; transfer needs distinct from/to actors and must originate from the current saved custodian.
- Invalid transitions return 409; invalid actors return 422.

Custody history is included in evidence detail and case snapshots; there is no separate standalone custody-history GET route. Manual custody writes generate audit entries. Transfers lock the parent evidence row in PostgreSQL (SQLite uses a writer transaction); competing transfers cannot both consume the same custodian. Actor names remain supplied strings, not authenticated recipient signatures. The database history is not cryptographically append-only or independently notarized.

Audited actions include login/logout/access revocation, case creation, upload/registration/verification/custody, queued analysis/report, retries, Copilot queries and demo reset. Copilot audit metadata records citations, not a complete immutable transcript. The senior/admin audit endpoint returns the latest 200 records. Reads and successful worker completions are not comprehensively audited. Audit retention/export and tamper-resistant logging are not implemented.

## 12. Queue, worker recovery and failures

Analysis and report requests return HTTP 202 plus a job ID. Blockchain registration is synchronous and waits for a real receipt; there is no blockchain worker job in this implementation.

```text
queued → running → succeeded
                 → failed → explicit retry → queued

expired running lease → queued (attempts below 3)
                      → failed (attempts exhausted)
```

The worker claims oldest queued jobs using PostgreSQL row locks with SKIP LOCKED, marks them running and increments attempts. Progress is coarse: 0 queued, 20 running, 100 succeeded, not continuous percentage measurement.

Running leases older than five minutes are recovered. An independent heartbeat renews the current ownership token every 15 seconds. Fenced state updates reject stale owners. Failed jobs below three attempts can be retried by senior/forensics/admin. Ordinary errors become failed, not endlessly retried. Clients receive safe error summaries; tracebacks remain in server logs.

Analysis first commits extraction plus graph-sync job intents, then requires successful mirroring before reporting analysis-job success. A mirror outage retains the extraction and retryable reconciliation jobs; analysis retry reuses its saved analysis ID. Graph replacement is serialized per case in PostgreSQL and reads a fresh committed snapshot. Upload/report/import writes first persist cleanup intents for exact object keys; recovery removes only unreferenced managed objects. A successful report commits metadata and closes its cleanup intent together.

There is no external scheduler, cancellation API, dead-letter queue or exactly-once/distributed-transaction guarantee. Ordinary failed cleanup/graph jobs still need explicit retry after service recovery. Very long jobs, repeated database outages, reset races with new requests, and high-load multiworker behavior are not stress-certified. PostgreSQL remains authoritative; SQLite does not provide identical locking semantics.

## 13. Evidence-grounded Copilot

`POST /api/v1/copilot/query` accepts `case_id`, a 3–1,000-character question and locale `en` or `hi`.

The current deterministic answerer uses the selected case snapshot, matches canonical English/Hindi names or IDs, and supports an important-entity question by degree ranking. When nothing matches, it uses a small case-relationship fallback. Returned citations are intersected with real evidence IDs visible in that snapshot.

Response fields are `answer`, `reasoning`, `confidence` and `citations`. Confidence is currently 0.91 when citations exist and 0 otherwise. The reasoning string summarizes its graph-derived basis; it is not private model chain-of-thought. Answers contain a human-review/non-guilt disclaimer.

This is a functional cited case assistant, not a general semantic LLM, document-vector search, HippoRAG implementation or arbitrary investigative reasoning engine. An OpenAI key configuration field does not activate a provider. Frontend case-switch isolation was tested separately, but conversation history is not persisted by a backend chat-session API.

## 14. English/Hindi reports

Live HTML preview and queued saved reports use the same case snapshot. Report content includes case summary, cited relationships, timeline, entities, evidence IDs/hashes, review alerts, custody and saved blockchain references.

Generated artifacts are stored as:

```text
exports/{case_id}/{report_id}-{locale}.pdf
exports/{case_id}/{report_id}-{locale}.html
```

These are object keys inside the configured evidence bucket; the separately prepared MinIO `exports` bucket is not the bucket selected by the current worker.

Implemented reporting behavior:

- Locale validation accepts only English/Hindi.
- HTML escapes untrusted content and uses printable tables with wrapping.
- PDFs use A4 pages, repeating table headers, long-ID/hash wrapping and branded page footers.
- Linux image includes DejaVu/Noto fonts; separate English/Hindi font names avoid cross-job registration collisions.
- Hindi runs use shaping, while Latin identity codes/hash digits and original source text remain intact.
- Missing Hindi font fails clearly instead of silently generating unreadable boxes.
- Saved HTML previews and PDF downloads require authentication; older reports lacking stored HTML return 404 for preview.
- Reports state that saved receipts are not a fresh integrity check and human review is mandatory.

Four final browser-downloaded PDFs were rendered and visually inspected on all 72 pages. Each retained all seven seeded evidence IDs and complete hashes. Their length reflects accumulated synthetic audit records. Original/user-entered source text is preserved rather than automatically translated; curated labels/story summaries have Hindi equivalents.

No digital PDF signature, archival PDF/A certification, PDF-UA tagging or fully validated Hindi Unicode extraction round trip is implemented. The HTML preview remains available. Report history has no deletion/version-management endpoint.

## 15. API inventory

Application APIs use `/api/v1`; liveness/readiness and automatic docs are outside that prefix. Below, `authenticated` means any active signed-in prototype role; named write roles follow the matrix in section 5.

| Method | Path | Access / behavior |
| --- | --- | --- |
| GET | `/health` | Public process liveness/version |
| GET | `/ready` | Public dependency readiness; 503 on degradation |
| GET | `/docs`, `/redoc`, `/openapi.json` | Automatic FastAPI documentation/schema |
| POST | `/api/v1/auth/login` | Public validated credentials → token pair/user |
| POST | `/api/v1/auth/refresh` | Valid refresh token → rotated pair |
| POST | `/api/v1/auth/logout` | Authenticated; revoke current access/supplied refresh |
| GET | `/api/v1/auth/me` | Authenticated current user |
| GET | `/api/v1/demo/accounts` | Public local-demo quick-fill account information |
| GET | `/api/v1/cases` | Authenticated list with snapshot-derived counts |
| POST | `/api/v1/cases` | Investigator/senior/admin; create, 201 |
| GET | `/api/v1/cases/{case_id}` | Authenticated case metadata/counts |
| GET | `/api/v1/cases/{case_id}/snapshot` | Authenticated complete scoped read model |
| GET | `/api/v1/cases/{case_id}/graph` | Authenticated graph nodes/edges |
| GET | `/api/v1/cases/{case_id}/timeline` | Authenticated ordered events |
| GET | `/api/v1/cases/{case_id}/map` | Authenticated location-bearing events |
| GET | `/api/v1/cases/{case_id}/network` | Authenticated degree ranking |
| GET | `/api/v1/cases/{case_id}/related` | Authenticated shared-entity case discovery |
| GET | `/api/v1/cases/{case_id}/report-preview?locale=en` | Authenticated current HTML inside JSON |
| GET | `/api/v1/cases/{case_id}/reports` | Authenticated stored report history |
| POST | `/api/v1/cases/{case_id}/reports` | Investigator/senior/admin; queue locale report, 202 |
| GET | `/api/v1/evidence?case_id=...` | Authenticated primary-case evidence list |
| POST | `/api/v1/evidence` | All four roles; validated multipart intake, 201 |
| GET | `/api/v1/evidence/{evidence_id}` | Authenticated metadata, custody, analyses and saved anchor |
| GET | `/api/v1/evidence/{evidence_id}/file` | Authenticated streamed original preview/download |
| POST | `/api/v1/evidence/{evidence_id}/register` | Senior/forensics/admin; synchronous live receipt |
| GET | `/api/v1/evidence/{evidence_id}/blockchain` | Authenticated saved proof plus live status |
| POST | `/api/v1/evidence/{evidence_id}/analyze` | All four roles; queue analysis, 202 |
| POST | `/api/v1/evidence/{evidence_id}/verify` | Authenticated; original or comparison-file hashing |
| GET | `/api/v1/evidence/{evidence_id}/qr` | Authenticated PNG QR |
| POST | `/api/v1/evidence/{evidence_id}/custody` | Senior/forensics/admin; manual transition |
| GET | `/api/v1/verify/{token}` | Public limited identity/live-anchor lookup |
| GET | `/api/v1/jobs/{job_id}` | Authenticated kind/target/state/progress/result/error |
| POST | `/api/v1/jobs/{job_id}/retry` | Senior/forensics/admin; bounded failed-job retry, 202 |
| POST | `/api/v1/copilot/query` | Authenticated deterministic case answer/citations |
| GET | `/api/v1/reports/{report_id}/download` | Authenticated PDF attachment |
| GET | `/api/v1/reports/{report_id}/preview` | Authenticated saved HTML inside JSON |
| POST | `/api/v1/admin/reset-demo` | Admin; destructive relational/raw-storage/graph reseed |
| GET | `/api/v1/audit` | Senior/admin; latest 200 records |

There are no general case/evidence update/delete APIs, arbitrary global search endpoint, user-management API, alert-management API, standalone entity-write API, SSE/WebSocket job stream or general evidence-case linking route in this branch.

### Validation and error contract

Request models enforce email format, minimum password length, case title/description bounds, priority values, Copilot question length, supported locale and manual custody event values/notes length.

Handled HTTP/validation errors use an `error` envelope and matching `detail` for client compatibility:

```json
{
  "error": {
    "code": "case_not_found",
    "message": "Case was not found."
  },
  "detail": {
    "code": "case_not_found",
    "message": "Case was not found."
  }
}
```

Validation errors additionally contain `fields` with field/message entries. Common statuses include 401 session/credentials, 403 role denial, 404 missing identity, 409 duplicates/custody/chain conflict, 413 size, 415 content/MIME, 422 fields and 503 unavailable dependencies.

Unexpected HTTP exceptions receive a safe `internal_error` JSON envelope without internal exception text; framework HTTP errors use the same envelope. Allowed-origin headers are retained for unexpected errors. Worker failures use safe summaries and server-side traceback logs. Bridge errors retain their internal bridge envelope. Streaming failures after response headers cannot be replaced with a new JSON response; no universal failure-mode certification is claimed.

## 16. Synthetic demo and reset behavior

Operation Nightfall (`CASE-2026-017`) and related Operation Northbridge (`CASE-X007`) are idempotently seeded with four demo roles, four people, two vehicles, three Delhi NCR locations, a financial account and a related-case entity. Extraction adds supported phone entities and further cited records.

| Seed evidence | Actual artifact / contribution |
| --- | --- |
| `EV-2026-0001` | FIR PDF; initial fictional narrative/entities |
| `EV-2026-0002` | CDR CSV; calls, phones, source-supported ownership and tower events |
| `EV-2026-0003` | Financial CSV; account transfers and threshold review alert |
| `EV-2026-0004` | Synthetic PNG; dimensions and exact-fixture curated sighting |
| `EV-2026-0005` | Synthetic WAV tone; audio metadata and exact-fixture curated caption |
| `EV-2026-0006` | Short still-based MP4; metadata and exact-fixture curated sighting |
| `EV-2026-0007` | Investigation note; cited cross-case/vehicle/location mentions, shared with Northbridge |

The seed reads actual files from `data/demo`, hashes/stores them, creates custody and analyses, and adds curated relationships/timeline/alerts. Missing required artifacts fail startup rather than generating fake files. Seed evidence starts analyzed but **unanchored**; startup does not invent transaction/block receipts.

### Reset is broad and destructive

The admin route refuses while jobs are queued/running. Otherwise it clears case-scoped Neo4j nodes, deletes **all prototype relational records**, including users/tokens/jobs/reports/audit, removes `raw/case/` and `exports/` storage prefixes, reseeds and mirrors both Nightfall and Northbridge. This also removes imported expanded cases. It is not a narrowly targeted one-case reset or a distributed atomic reset.

Chain history is not erased. All demo sessions are affected; seed users are recreated. This operation requires explicit approval on an isolated demo. The repaired reset was tested only with disposable databases/object directories, including a temporary PostgreSQL schema. No live reset was performed; browser reset endpoints remain blocked in the historical audit.

Previously saved anchors may be historical after a Hardhat restart. Retained PostgreSQL/MinIO/Neo4j data is not proof that the restarted chain still contains those anchors. Fresh final-run evidence was registered and verified after the approved restart.

## 17. Validation evidence and safe operation

Recorded final local checks on 13 September 2026:

| Suite/check | Result / scope |
| --- | --- |
| Backend default pytest | 12 passed; 3 external opt-in tests skipped |
| Contract tests | 2 passed; deploy/register/retrieve/event/duplicate/hash behavior |
| Non-reset live Compose integration | 1 passed, reset test deselected; actual MinIO/PostgreSQL/ethers/Hardhat/worker/Neo4j |
| Full browser judging/control tests | 14 passed across desktop/mobile-sized Chromium |
| Separate showcase browser tests | 6 passed; not evidence of backend/cloud persistence |
| Frontend unit suite | 8 passed, including case-isolation/session/citation behavior |
| TypeScript / production build | Passed |
| Bilingual live PDF review | Four actual downloads, 72 rendered/visually inspected pages, seven seeded IDs/hashes checked in each |
| Backend readiness | All four dependency checks passed in the final recorded live check |

Backend tests cover deterministic hashing/tampering, UUID evidence IDs, case-scoped graph/Copilot citations, role denial, real QR bytes, queued work, report generation/fonts/escaping, new-case isolation and worker results, content rejection, custody, refresh/logout, body-size rejection and exhausted lease recovery. The default suite uses SQLite/filesystem; some graph calls are mocked. It must not be confused with the separate real external-service integration.

The opt-in live-chain recovery test exists and exercises receipt recovery against a reachable local bridge with an isolated relational test setup. Compose does not publish bridge port 8787 by default; that test needs its own appropriate local bridge exposure. It was not part of the final default pytest run.

### Inspect the running stack

From the repository root:

```sh
docker compose ps
curl --fail http://localhost:8000/health
curl --fail http://localhost:8000/ready
docker compose logs --tail=100 backend worker blockchain-bridge
```

`/health` is process liveness, not full dependency readiness. `/ready` checks a database query, storage bucket preparation, Neo4j connectivity and bridge health, returning 503 when degraded. It does not perform a new upload/transaction/job, and does not certify worker heartbeat or storage write capacity. The backend container healthcheck uses `/health`; manually check `/ready` for judging readiness.

### Safe regression commands

These assume dependencies already installed. Do not run destructive opt-ins against a live investigation database.

```sh
PYTHONPATH=backend .venv/bin/pytest -q backend/tests

DECYPHER_INTEGRATION=1 TEST_API_URL=http://127.0.0.1:8000 PYTHONPATH=backend .venv/bin/pytest -q backend/tests/test_integration.py -k storage_chain_graph_and_job_pipeline

npm run test:e2e:full
```

The non-reset integration and browser suite add synthetic records. The full browser suite blocks the reset route. Contract tests are run from `blockchain` using `npm test` with its dependencies and compatible runtime. On this Mac, use an arm64 Node runtime for frontend dependencies; the default x64 Node installation is incompatible with installed native modules. Avoid overlapping Playwright runs sharing their output directory.

Docker Desktop and first-time dependency/image registry access are required. Production API hosting is not provided by publishing the static Vercel showcase. No cloud backend release, production secrets provisioning or managed database deployment was completed.

## 18. Remaining work and honest boundaries

| Area | Implemented now | Not completed / needs further work |
| --- | --- | --- |
| Security | Password hashes, JWTs, rotation/revocation, role gates | MFA, tenant/case authorization, rate limits, secure deployment policy, account lifecycle, production key management |
| Storage/intake | Bounded hashing/spooling, MinIO/filesystem, signatures, secure stream | S3 adapter, malware scanning, resumability, HTTP ranges, object lifecycle/encryption governance, broader failure cleanup |
| Blockchain | Real local registry/receipts/verification/recovery | Persistent deployed network, contract access control, investigator signing, robust chain identity/finality checks |
| Analysis | Deterministic text/CSV/metadata, curated exact-fixture captions | OCR, transcription/vision, generic schema/entity inference, calibrated confidence, operational paid-AI interface |
| Graph/network | Cited transactional case mirror, simple degree/related-case reads | General bridge algorithms, sophisticated anomalies, scale indexes/load tests, cross-database reconciliation |
| Worker | Persisted jobs, fenced heartbeats, stale recovery, cleanup/reconciliation intents, manual retry | Cancellation, SQS/dead letters, exactly-once execution, long-job/multiworker stress testing |
| Custody/audit | Serialized validated manual transitions and recorded events | Signed recipients, tamper-proof append-only storage, comprehensive audit/export/retention |
| Reports | Working HTML/PDF/history, Hindi shaping, partial-write/reset export cleanup | Signed/archival/tagged PDFs, fully verified Hindi searchable text, retention lifecycle |
| Operations | Compose ordering, migrations, liveness/readiness, local E2E | Cloud deployment, TLS/network hardening, backups/restore drills, monitoring/alerts, incident response and certification |

Do not interpret environment placeholders or demo thresholds as completed cloud services, AI intelligence or legal standards. No claim in this document establishes guilt, authenticity before intake, production security or forensic admissibility.

## 19. Source map

Paths below are relative to the repository root.

| File | Main responsibility |
| --- | --- |
| `backend/app/main.py` | Routes, permissions, response/errors and application startup |
| `backend/app/config.py` | Configuration fields/defaults |
| `backend/app/database.py` | Engine, sessions, SQLite FK enforcement |
| `backend/app/models.py` / `schemas.py` | Persistence and validated API models |
| `backend/app/security.py` | Passwords, tokens, current user and roles |
| `backend/app/ingest.py` / `upload_limits.py` | Chunked hashing, filenames, content and body limits |
| `backend/app/services.py` | Storage, blockchain/Neo4j services, analysis wrapper, QR and Copilot |
| `backend/app/analysis.py` | Structured deterministic extraction and stable entity/event relationships |
| `backend/app/snapshot.py` | Shared case-scoped read/citation model |
| `backend/app/worker.py` | Job claim/execution/recovery loop |
| `backend/app/jobs.py` | Renewable ownership, fencing, exact-key cleanup and graph intents |
| `backend/app/demo_bundle.py` | Explicit synthetic bundle validation and additive import |
| `scripts/generate_synthetic_demo.mjs` | Deterministic spreadsheet-authored CSV/text artifact generation |
| `backend/app/reports.py` / `report_html.py` / `presentation.py` | PDF/HTML and curated localization |
| `backend/app/seed.py` | Fictional artifacts/story/accounts and reset scope |
| `backend/alembic/versions/` | Prototype migration revisions |
| `backend/tests/` | Default, reliability and opt-in integration/chain tests |
| `blockchain/contracts/EvidenceRegistry.sol` | Hash/identity EVM registry |
| `blockchain/bridge.js` | Real ethers transaction/lookup bridge |
| `blockchain/scripts/deploy.js` / `healthcheck.js` | Reuse/deploy and local RPC readiness |
| `blockchain/test/EvidenceRegistry.test.js` | Contract test assertions |
| `docker-compose.yml` / `backend/Dockerfile` | Local orchestration/runtime |
| `scripts/build_showcase.py` | Isolated synthetic snapshot/report export, not a cloud backend |
| `docs/CONTROL_AUDIT.md` | Dated passed control matrix and exact validation boundaries |

This file is an implementation inventory, not a security audit or a promise that every possible input/failure mode has been tested.
