# Document capture, bilingual OCR and QR scanning

Status: proposed implementation design, awaiting written-design review. Scope approved in conversation: both document and QR scanners, English/Hindi OCR, preserved originals and separately hashed derivatives. No scanner/OCR implementation or runtime deployment is claimed by this document.

## Scope and existing architecture

PostgreSQL remains authoritative for users, cases, evidence metadata, custody, analyses, jobs and audit records. SQLAlchemy/Alembic manage persistence/migrations. Neo4j remains an evidence-backed graph mirror. MinIO remains the local file store. SQLite remains a disposable-test/standalone fallback, not the judging database. Existing uncommitted S3 adapter work is left unchanged and is not activated, reverted or migrated by this project.

Build three connected stages in this order: QR decoder, document capture, then persisted OCR/review. Use the existing case-scoped upload API, protected evidence page, public identity page and renewable/fenced worker jobs. No new queue system or paid provider is required.

## Approach selection

1. **Selected:** browser camera/manual crop plus local Tesseract 5 `eng+hin`, with OpenCV page-boundary suggestions and ZXing QR decoding. This is the least complex CPU-first implementation for the existing local stack and leaves all authority in the backend.
2. Optional future provider: exact PaddleOCR PP-OCRv5 Devanagari recognizer plus a compatible detector. Add only after a held-out benchmark demonstrates benefit; do not install a second deep-learning stack by default.
3. Deferred: generative document VLMs or cloud OCR. They add hardware, licensing, cost and unsupported-transcription risks without being necessary for the core prototype.

Primary-source language, licensing and capability checks are in [the research note](../../SCANNER_OCR_RESEARCH.md). Candidate selection is not an accuracy benchmark. Hindi handwriting is explicitly outside reliable printed-OCR claims.

## QR decoder

Add an accessible scanner panel on verification entry points, with camera start/stop, device selection, uploaded-image decoding and manual token entry. Use `@zxing/browser` behind a small decoder interface; pin dependencies and retain a fallback path if a browser/camera is unavailable.

Decoded content is untrusted. Accept only a bounded opaque token in the app's token format, or a `/verify/:token` URL on the current origin or configured Decypher public origin. A local generated QR may carry `localhost`; permit that explicit configured origin but route locally rather than opening its host on the phone. Reject unrelated URLs, malformed encoding, extra path segments, oversized content and script/data schemes. Never automatically navigate to an arbitrary scanned destination or upload frames to a third party.

Decoding navigates to the existing public identity page. That API does **not** rehash stored bytes, so preserve the identity-only label and never show an integrity-verified badge from decoding or `ANCHORED`. Signed-in users get an explicit full check using the existing protected evidence verification API; signed-out users get a sign-in action preserving the evidence destination. Keep invalid identity, unregistered, unavailable chain, mismatched chain, modified bytes and fully verified results distinct. Do not change blockchain registration policy.

## Document capture and intake

Add a case-scoped capture panel alongside normal upload. Request video only after a user action, allow webcam/phone camera selection, and keep uploaded-image capture as a fallback. For every capture, freeze original encoded bytes before editing and calculate a browser hash for feedback only; the backend computes authoritative hashes.

Support up to 20 pages per session: thumbnail selection, rotate, four-corner/manual crop, page removal and keyboard-accessible reorder. OpenCV/OpenCV.js can suggest page corners/perspective correction, but manual corners remain available when suggestions fail. Do not silently overwrite original bytes. Store transformation parameters, source dimensions and ordered source references for each derived page.

The first intake uses the existing authenticated upload path for each original. Add an idempotent case-scoped scan-session API to persist ordered source IDs and validated transforms, rather than trusting browser metadata or treating an assembled PDF as an original. All sources must belong or be linked to the selected case and must be accepted images. Reject excessive page counts, non-finite/out-of-bounds corners and unsupported transforms. Repeated attachment of the same accepted source reuses its identity; globally duplicated evidence from another case must not silently grant case access.

Upload originals first, then assemble a scan through a background job. If one upload fails, keep successful evidence and show which page needs retry; no broad reset or unannounced deletion. A source cannot be replaced once the session is submitted. An assembly is a derivative with its own hash and ordered source links. Display source versus cropped/assembled previews clearly.

## Persistence and API contract

Add Alembic migration after `0004_job_leases`, with PostgreSQL and SQLite tests:

- `scan_sessions`: UUID identity, case, creator, idempotency key scoped to creator/case, created timestamp, submission state and assembly job reference.
- `scan_pages`: session, unique order index, source evidence ID, dimensions and validated transformation JSON.
- `evidence_derivatives`: UUID identity, source evidence/session reference, kind, MIME, object key, byte size, SHA-256, engine/model/language/transform metadata, producing job and timestamp. Unique producing-job/output-slot prevents duplicate outputs on retry. Multiple original references use an association table rather than one ambiguous parent.
- `ocr_pages`: source evidence or scan page, producing job, original page number, extracted immutable text/regions, extraction method, engine revision, languages and confidence. Page dimensions/coordinate system are explicit.
- `ocr_corrections`: page/region, author, timestamp, expected current revision, new reviewed text and reason. Append revisions; never mutate raw OCR. Competing corrections return a conflict rather than overwrite each other.

Endpoints remain under `/api/v1`: create/retrieve/submit scan sessions; enqueue evidence OCR; retrieve OCR pages/revisions; append corrections; list and securely stream derivatives. Retain current role vocabulary: investigator/senior/forensics/admin can request OCR/capture; forensics/senior/admin can mark reviewed corrections. All reads are authenticated except the unchanged public QR identity flow. Existing prototype lacks tenant/case ACLs; this addition must not imply production authorization is solved.

OCR/session mutations return existing-format jobs (202) and explicit queued/running/succeeded/failed states. Idempotency keys and unique producing-job outputs prevent duplicate retries. Derivative streaming uses protected routes, not public object URLs. Consistent JSON errors cover missing evidence, unsupported media, invalid geometry, limits, stale corrections and unavailable engine.

## OCR worker and provenance

Use an isolated provider interface returning page text, word/line boxes, confidence, extraction method and version metadata. Default provider is Tesseract 5 with pinned English/Hindi/OSD trained-data checksums supplied at image build/cache setup, not downloaded per job. Record actual engine/model revisions. Run no shell interpolation of filenames; use generated local temporary paths and bounded subprocess calls.

For PDFs, keep usable embedded text on a per-page basis and OCR only image-only pages. Rasterization uses a bounded native PDF renderer, initially around 300 DPI capped by pixel limits. Preserve page ordering in mixed PDFs. Password-protected/malformed PDFs fail explicitly. Images use orientation metadata consistently; record geometry mapping before rotation/crop so regions can be located on the original.

Initial limits are configurable prototype safeguards, not performance promises: 100 MiB upload cap remains; 20 pages per OCR job; 16 megapixels per decoded/rasterized page; 60 seconds per OCR subprocess; 10 minutes total processing; one OCR process per worker initially; bounded extracted text/region counts. Enforce decoded dimensions before allocating full raster buffers where possible. Timeout/cancellation/failure cannot leave a job falsely succeeded or a partial derivative publicly visible.

Persist original pages and raw results, then create separately hashed text/JSON and searchable/assembled PDF derivatives. Avoid inventing a searchable Unicode guarantee for Hindi until extraction round-trip tests pass; raw UTF-8 text and HTML review remain available. Record source IDs/hashes, derivative hashes, page number, boxes, languages, engine versions and preprocessing parameters. Confidence is engine output, not truth probability. Do not infer signatures, document authenticity or guilt.

Reuse owned-job fencing, independent heartbeats, temporary-directory cleanup and durable exact-object cleanup before cloud/object writes. Do not hold a database writer transaction/row lock during rasterization or OCR subprocess work: snapshot inputs, release the transaction, process the page, then publish in a short fenced transaction. Extend reference-aware orphan cleanup to consider derivative records and session/page associations. A stale worker cannot publish pages, corrections or derivatives. Saved page outputs can be reused only for the same source hash/options/engine revision. Reset ordering includes these new tables/managed derivative objects in disposable tests; do not execute live reset.

## Review, analysis and citation integration

Evidence pages show original/processed previews, page list, raw OCR text, highlighted regions, confidence and immutable correction history. Corrections require a reason and an audited role-authorized save. Preserve English/Hindi UI translation; do not machine-translate source identities/text as if it were extracted OCR.

Extend deterministic analysis to accept extracted OCR text while recording extraction provenance. The original evidence ID stays authoritative. Any OCR-derived finding, graph relationship, Copilot citation or report excerpt must resolve to the source evidence plus page/region and extraction/review revision. Preserve existing string evidence IDs for compatibility and add structured citation details alongside them; do not replace them with unresolvable OCR strings. Unreviewed OCR is labeled as such; corrections do not silently change historic report citations.

## Camera/showcase behavior

Handle permission denied, camera absent/busy, cancelled prompt, bad image, decode not found, interrupted job and API outage explicitly. Stop media tracks and decoding loops on close/navigation/device change; revoke owned object URLs and dispose OpenCV buffers. Persist no live video frames beyond explicit captures.

Camera access requires HTTPS or localhost and appropriate iframe permission. A phone visiting the Mac's LAN HTTP address needs a secure-context setup; do not falsely claim physical-phone camera testing from mobile viewport tests. File/manual-token fallbacks work without camera access.

Showcase permits document capture/edit/download and browser hashing, and QR decoding to known curated identities. Persisted scan sessions, server OCR, corrections, derivatives and full integrity checks show “Local secure service required.” Do not fabricate OCR completion, chain receipts or secure persistence. No S3 or cloud deployment/configuration changes are part of this work.

## Acceptance and test strategy

- Backend: migration fresh/repeated upgrades; session idempotency/case validation; geometry/page/pixel limits; duplicate cross-case evidence handling; role enforcement; immutable raw OCR/versioned corrections/conflicts; source/derivative hash verification; stale-worker fencing; crash/partial-write/orphan cleanup; per-page progress/retry; mixed-text/scanned PDF ordering; protected derivative streams and bounded subprocess errors.
- OCR fixtures: explicitly synthetic printed English/Hindi/mixed-script documents, rotated/skewed/blurred/shadowed images, image-only and mixed PDFs, malformed/encrypted inputs and negative handwriting examples. Maintain a held-out manually reviewed text set. Report character/field errors and CPU latency/memory separately; test plumbing pass is not an accuracy claim.
- Frontend: camera permission/device/lifecycle mocks; file fallback; crop/reorder/keyboard controls; QR payload allowlist/encoding; deep links/Back/Forward; login destination preservation; locale labels; progress/errors/retry; confidence/correction/citation navigation; showcase restrictions.
- End-to-end: capture or upload synthetic pages → preserve originals → assemble → OCR → review/correct → cited analysis/report → QR decode → identity-only display → authenticated real stored-byte/contract verification. Run desktop/mobile viewport audits; physical phone/webcam checks are separately recorded only when actually performed.

## Delivery boundaries

No S3 activation/migration, AWS credentials, paid AI, cloud resource creation, live reset, Git push or publishing is authorized by this scanner implementation. Native OCR/PDF tools and model assets require dependency downloads/build verification. Production MFA/tenant policies, reliable Hindi handwriting, advanced dewarping, large-batch scanning and calibrated confidence remain outside this prototype.
