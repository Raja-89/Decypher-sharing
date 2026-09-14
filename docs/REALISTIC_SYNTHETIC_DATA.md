# Detailed fictional investigation pack

## Delivered data

`data/demo/realistic-v2` contains ten detailed fictional investigations and 200 source artifacts, separate from `expanded-v1` and the classic seed. Nothing is automatically loaded into the running demo.

Each case has **500 calls, 150 transactions, 20 source observations and an entity inventory**. Its 20 artifacts are eight CSVs, seven source notes, two staged-scene PNGs, one test-tone WAV, one short staged CCTV-diagram MP4 and one synthetic case PDF. Totals: **5,000 calls, 1,500 transactions, 200 observations, 50 fictional people/phone identities, 15 vehicles, 20 accounts, ten organizations and 15 public neighborhood locations**.

| Investigation | Source uncertainty and alternatives |
| --- | --- |
| Nightfall | Consignment routing with a disputed pickup and differing witness/ledger times |
| Northbridge | Duplicate receipts: reprint, synchronization delay or substituted delivery |
| Copper Ledger | Credit notes and possible legitimate refunds requiring authorizations |
| River Signal | Equipment handover occurrence time differs from recorded intake |
| Orchard Route | Route exceptions, possible road closure and undocumented verbal approval |
| Mirror Exchange | Reused beneficiary labels may reflect invoicing software, not common control |
| Harbor Receipt | Duplicate return scans after an outage and an unresolved carton pickup |
| Lantern Access | Maintenance access with a replacement technician and incomplete roster |
| Summit Voucher | Rescheduled travel with a missing approval revision |
| Ember Transfer | Receiving counts may differ because boxes and units were counted |

Priorities include critical/high/medium/low; statuses include active/pending/closed. Source-named people have occupations, age bands and review roles. Vehicles use non-registrable `SYN-VEH` codes. Phone identifiers are non-dialable fictional codes; accounts and organizations use `SYN` labels. No real victim identities, subscriber details, private addresses or supplied credentials are used.

## Screen coverage

- Registry/case details: distinct narratives, leads, priorities, statuses and unresolved questions.
- Evidence: six accepted MIME categories, actual bytes/hashes, source notes, inventories, supplied captions and authored transcripts.
- Graph/entities/network: explicit source-listed roles/phone assignments, supplier accounts, vehicle/depot mentions and cross-case contacts. Every relationship cites its actual evidence source.
- Timeline/financial: 670 occurrence records per own case. Calls precede financial sequences; unanswered calls and routine settlements provide background activity. Larger transfers are review signals, not guilt classifications.
- Maps: three public neighborhoods per case, covering 15 across the pack. Approximate coordinates are not exact premises or proof of presence; tower labels do not prove subscriber location.
- Alerts/custody: cited discrepancies, common references and larger transfers; collection/hash/analysis plus two explicitly fictional handovers per artifact. Source observation confidence is author-assigned, not a calibrated probability. Custody actors/times match the source ledger, not recipient signatures.
- Copilot: case-specific questions and English/Hindi example responses from real case relationships, with resolvable citations. The deterministic assistant is not unrestricted semantic investigation reasoning.
- Reports: complete English/Hindi HTML previews generated from the case read model. The ten source PDFs are synthetic intake/source-review records, not official FIRs or signed conclusions.

**Real receipts, operational job completions and saved PDF-report history are not invented to fill panels.** Register selected evidence and run actual report jobs after import to create these records. Source evidence stays unanchored until real registration. Generated QR tokens identify evidence; they are not chain confirmations.

## Fidelity and loading

`manifest.json` lists every source ID/path/MIME/size/SHA-256, cases and sharing links. Occurrence timestamps, witness estimates and intake times remain distinct; conflicts are exposed rather than silently normalized. The invented August 2026 sequence precedes this demo checkpoint. All source timestamps contain timezones.

Inventory CSVs explicitly require fictional provenance and synthetic properties. Observation CSVs have typed endpoints and a bounded relationship vocabulary. Inventories load before calls so new map coordinates are available. The loader validates hashes/content/counts/IDs/paths/schema and rechecks bytes at import; repeated imports create no duplicate evidence/analyses. Existing entity properties are retained when adding source properties, and roles may be plural. Canonical lookup uses indexed exact matching before case-insensitive/alias resolution.

Read-only validation:

```sh
PYTHONPATH=backend .venv/bin/python -m app.demo_bundle --bundle data/demo/realistic-v2
```

After deploying the updated backend/worker, the following explicitly adds originals, metadata, analyses, custody and graph-sync intents to the local development demo. It does not reset data or register on-chain:

```sh
docker compose exec backend python -m app.demo_bundle --bundle /app/data/demo/realistic-v2 --apply --confirm-local-demo
```

On a clean classic database it adds ten cases/200 artifacts to the original two cases/seven artifacts. Prefer the richer pack instead of loading both packs merely to inflate counts. The broad admin reset would remove imported cases and restore the classic seed; do not use it to import or repeat this pack.

Offline preview generation uses a disposable database, never cloud credentials:

```sh
.venv/bin/python scripts/build_rich_preview.py --bundle data/demo/realistic-v2
```

This creates ten JSON snapshots, 20 HTML reports, coverage counts and bilingual Copilot examples in `previews/`. It refuses overwrite. Previews/QA renders are Git/Docker-ignored; the 200 original artifacts and manifest are not. The existing live Vercel showcase still exposes its original two-case story until separately integrated. New files alone do not constitute a frontend deployment.

Reproduction with an artifact-tool-capable Node runtime:

```sh
node scripts/generate_synthetic_demo.mjs --profile realistic --seed 20260915 --output tmp/reproduced-rich-pack --runtime /absolute/path/to/artifact-runtime
.venv/bin/python scripts/finish_rich_demo.py --bundle tmp/reproduced-rich-pack
```

Directory overwrite is refused. Planned source records are seed-deterministic; final hashes always come from actual exports. Renderer/font/codec versions can affect media reproduction. Images/videos are staged diagrams and WAVs are test tones with separate transcripts, not real recordings or model recognition.

Large event graphs and complete long-form PDFs need live browser/performance validation after loading. Use the classic seed for the short main judging pitch until then. Offline source tests use filesystem storage/mocked Neo4j, not the running MinIO/chain/graph deployment. No credential file was needed or read; cloud provisioning, live import/reset and repaired-image release remain separate actions.

## Offline validation — 14 September 2026

The final backend regression run passed **31 tests**, with three external-service opt-in tests skipped, in 164.59 seconds. This includes actual rich-pack import, stored-object/manifest hash agreement, repeat-import idempotency, source-grounded case coverage, custody actors and the alias-substring regression. Eight dependency deprecation warnings remain. The skipped tests are not evidence of a new live infrastructure validation.

The final exported bytes for all 200 artifacts match their manifest sizes and SHA-256 hashes. All 80 CSV sample renders and ten source PDF pages were visually inspected; PDF fonts are embedded. Staged video frames were inspected, and seeded source planning repeats identically for the same seed.

A disposable database import produced ten case snapshots, 20 English/Hindi HTML report previews and 20 cited Copilot examples. Across these snapshots there are **11,700 relationships, 6,700 timeline events, 5,200 map events and 90 review alerts**. All graph/node/timeline/alert/Copilot citations resolve to visible evidence. Each case includes 20 original artifacts plus one shared cross-case source note, and 105 custody entries when that shared note is included. Fifteen public locations are represented. There are no blockchain anchors or saved operational report records.

These counts come from offline read-model checks, not a new live browser or Neo4j deployment. HTML previews were structurally/citation checked; this checkpoint does not claim visual review of all 20 HTML reports. SQLite can block independent heartbeat writes during a long import transaction; multi-worker stress and large-graph rendering still require validation against the deployed PostgreSQL stack.
