# Full-mode browser judging and control audit — 13 September 2026

## Outcome

The local prototype judging slice and the control groups below passed the final clean run: **14 full-stack browser tests** across desktop and mobile-sized Chromium. The separate showcase suite passed **6 tests**. This is local prototype validation, not production, forensic, accessibility or physical-device certification.

The approved Docker Desktop restart recovered the earlier disk/filesystem failure. Backend, frontend, PostgreSQL, Neo4j, MinIO, Hardhat and the blockchain bridge are healthy. The worker is running and completed real analysis/report jobs; it has no independent Docker healthcheck. Readiness reports database, storage, Neo4j and blockchain checks true.

No live reset, evidence/case deletion, volume deletion, Git push or Vercel publication was performed. Browser tests block reset endpoints and check only reset visibility/role restrictions. Synthetic audit cases, evidence, custody events and report history remain.

## Recorded final checks

| Check | Result |
| --- | --- |
| Full judging/control browser suite | 14 passed, 1.5 minutes; desktop 1360×900 and mobile-sized 390×844 Chromium |
| Separate showcase browser suite | 6 passed, 11.7 seconds; temporary showcase server stopped afterward |
| Backend regression suite | 12 passed, 3 opt-in external tests skipped |
| Real Compose upload → MinIO → PostgreSQL → ethers/Hardhat → worker → Neo4j → verification | 1 passed, 9.77 seconds; reset test deselected |
| Contract registration, retrieval, events, duplicate and hash checks | 2 passed in Docker Node 22 on an isolated test network |
| Frontend unit suite | 8 passed, including case-switch/late-response Copilot regressions |
| TypeScript and production build | Passed using bundled arm64 Node |
| Four actual browser-downloaded English/Hindi PDFs | 18 pages each; all 72 pages rendered and visually inspected |
| Independent PDF identity check | All seven seeded evidence IDs and complete SHA-256 hashes preserved in each PDF |
| Diff whitespace check | Passed |

Earlier failed/interrupted diagnostic runs were superseded by this clean final run. Run Playwright suites sequentially when sharing `test-results`; overlapping runners can remove another runner's traces.

## Validated controls

| Surface | Passed control groups |
| --- | --- |
| Authentication | Four quick fills, password visibility, invalid credentials, sign-in, role restrictions, session refresh, logout and protected routing |
| Public navigation | Primary/mobile menus, brand/home/workflow/footer routes and login entry |
| Case registry/workspace | Search, create/cancel/validation/priority, all eight tabs, empty new-case scoping, count cards, case switching, URL filters, reload, Back/Forward, error/retry and citations |
| Evidence intake | Actual file chooser, independent SHA-256 comparison, supported synthetic artifacts and invalid image rejection |
| Evidence record | Secure original/media downloads and previews, copy hash, real registration, queued analysis, live verification, modified-file comparison, custody transfer, QR identity and library/graph links |
| Graph | Keyboard node selection, properties, directed edge confidence/citations, search/filter, zoom/reset, background pan and node drag |
| Timeline/financial | Filters, timestamps, evidence links and empty filtered financial state |
| Map | Zoom, marker/popups/close, grouped co-located events, popup citations, layers, tile outage and orientation controls; unsupported route geometry disabled with a reason |
| Network | Degree ranking, node inspector navigation and evidence links |
| Copilot | Open/close, typed query/send, all suggestions, confidence/reasoning and real citations; same-case reopen keeps history, case switch clears history and ignores stale responses |
| Reports | Case/locale-specific HTML iframe preview, queued English/Hindi generation, PDF downloads and stored history download |
| Responsive/locale | Mobile menu, overflow checks, A-/A/A+, high contrast, persisted Hindi and localized investigation views |
| Guided demo/admin | Eight-step pitch controls; reset visibility/role gating only, no reset executed |

Manual in-app browser inspection also covered desktop graph details, mobile-sized Hindi graph/map, actual OpenStreetMap tiles and popup citations. The temporary viewport and locale were restored. Viewport tests are not physical touchscreen or exhaustive WCAG tests.

## Live workflow

The final browser run signed in, opened Operation Nightfall, uploaded a synthetic CSV through the file chooser, compared its server hash with an independent digest, registered it through ethers/Hardhat and inspected the real receipt. Worker analysis, live registry verification, original download, custody transfer, MODIFIED tampering detection and opaque QR identity lookup completed. Graph/timeline/map/network and Copilot citations resolved to persisted evidence. English/Hindi HTML previews, queued PDFs and history downloads completed.

QR lookup identifies a record; it is not itself a byte-integrity check. Reports are saved snapshots, not a new live-chain check triggered by downloading them.

## Repairs completed during validation

- Rebuilt/recovered Docker frontend startup; added a real frontend healthcheck and read-only source/public mounts.
- Corrected selected-case graph captions, financial empty states and localized graph controls; tested pan, node drag and citations.
- Grouped co-located map events into selectable markers with all evidence links; fixed mobile stats overflow and latched tile-error warnings. Unsupported case routes remain disabled. Circles are orientation aids, not evidence-derived geofences.
- Prevented old-case Copilot history and late asynchronous responses from leaking into a new case; added focused regression tests.
- Fixed Linux English/Hindi PDF font-name collisions, preserved Latin IDs/hashes, shaped Hindi punctuation/hyphenated words correctly and escaped untrusted report markup. Real Docker PDFs were reviewed on every page.
- Expanded actual navigation, file-picker, gesture, zoom, report-history and citation assertions; repaired ambiguous selectors and awaited map animations.

## Recovery and retained records

The approved Docker restart restarted Hardhat's ephemeral chain and redeployed the registry at `0x5FbDB2315678afecb367f032d93F642f64180aa3`. PostgreSQL, MinIO and Neo4j volumes were retained. Previously saved receipts remain historical and can mismatch the restarted chain. Fresh final-run evidence was anchored and verified; old receipts were not fabricated as fresh confirmations.

The final files are `output/pdf/judging-{desktop,mobile}-{en,hi}.pdf`. Their 18-page length reflects accumulated synthetic audit uploads/custody checks, not a clean seven-artifact-only report. Earlier diagnostic report history remains stored. A clean isolated-demo reset requires separate approval and does not erase chain history.

## Rerun and remaining boundaries

With Compose/full mode running at port 8443, use `pnpm run test:e2e:full`. It adds synthetic records and blocks the live reset endpoint. Run showcase tests separately against a showcase-mode server. Use arm64 Node on this Mac; default x64 Node cannot load the installed arm64 native dependencies.

The non-reset integration command is:

```sh
DECYPHER_INTEGRATION=1 TEST_API_URL=http://127.0.0.1:8000 PYTHONPATH=backend .venv/bin/pytest -q backend/tests/test_integration.py -k storage_chain_graph_and_job_pipeline
```

Physical iOS/Android, Safari/Firefox, comprehensive WCAG and PDF-UA tagging are not certified. Hindi PDF text is visually shaped correctly, but searchable/copyable Unicode round-trip extraction is not fully validated; HTML previews remain available. Synthetic media metadata/captions do not imply advanced speech/vision recognition. Optional paid AI/cloud adapters and production-scale security/analysis remain prototype boundaries.

Vercel publication needs a separately approved destination project/team; no unrelated project was overwritten.
