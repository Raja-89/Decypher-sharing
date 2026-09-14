# Expanded synthetic demo — 14 September 2026

The newer ten-case/200-artifact pack is documented in [REALISTIC_SYNTHETIC_DATA.md](REALISTIC_SYNTHETIC_DATA.md). Prefer it for broad screen coverage; the earlier six-case pack below remains intact.

## Delivered pack

`data/demo/expanded-v1` contains a deterministic, entirely fictional bundle. `manifest.json` is the authoritative inventory: case/evidence IDs, relative file paths, MIME types, byte sizes, SHA-256 hashes, timestamps, record counts and shared-evidence links. The pack is about 1 MB without ignored QA images.

| New investigation | Call records | Transactions | Artifacts |
| --- | ---: | ---: | ---: |
| Operation Nightfall — Expanded Prelude | 400 | 100 | 14 |
| Operation Northbridge — Dispatch Trail | 360 | 90 | 14 |
| Copper Ledger | 340 | 85 | 13 |
| River Signal | 320 | 80 | 13 |
| Orchard Route | 300 | 75 | 13 |
| Mirror Exchange | 280 | 70 | 13 |
| Total | 2,000 | 500 | 80 |

The 80 evidence files are **36 CSVs plus 44 plain-text source documents**, not 80 audio/video files. Each case has three CDR segments and three financial segments. The original two-case/seven-artifact seed still supplies PDF, photograph, audio and CCTV demonstrations. In a clean classic database, additive import produces eight cases and 87 evidence records; existing audit/demo uploads increase those totals.

Names, account codes, phone codes, communications and transfers are invented. `SYN-` phone codes are non-dialable identifiers, not subscriber records. Source records describe a fictional September 2026 sequence, including an intake on 23 September; timestamps are deliberately fictional, not the import clock. Calls precede each case's financial sequence. Every 29th financial row uses INR 245,000 for the existing manual-review threshold; this is not a legal/regulatory/guilt finding.

Vikram Singh and three synthetic account codes bridge Nightfall/Northbridge. Copper/Mirror share Aarav Bedi; River/Mirror share Zoya Khan. Three explicit source-note links support cross-case review. Shared names are leads requiring corroboration. The analyzer does **not** infer subscriber ownership from these phone codes.

## Safe loading

Startup still uses the original small seed. Generation, validation and this document do not change the running database, register evidence on-chain, or reset anything.

First deploy the repaired backend/worker and migration `0004_job_leases`. Ensure Docker has enough free disk space. From the repository root, validate without loading:

```sh
PYTHONPATH=backend .venv/bin/python -m app.demo_bundle --bundle data/demo/expanded-v1
# Or inside the repaired image:
docker compose exec backend python -m app.demo_bundle --bundle /app/data/demo/expanded-v1
```

Expected validation counts: six cases, 80 artifacts, 2,000 calls, 500 transactions. Review the manifest before loading. The following command is an **explicit database/object-storage write**; run it only when ready to add the pack to the local demo:

```sh
docker compose exec backend python -m app.demo_bundle --bundle /app/data/demo/expanded-v1 --apply --confirm-local-demo
```

Apply requires `ENVIRONMENT=development` and initialized demo users. It refuses mismatched existing case/evidence identities, duplicate artifact hashes, unsafe paths/names, unsupported content, and invalid CSV schemas/timestamps. It streams originals into the configured storage, persists real hashes/custody, runs the supported deterministic analyzers, adds shared links, and queues six Neo4j reconciliation jobs. The worker must be running; inspect the returned `graphJobIds` through `/api/v1/jobs/{id}` with an authenticated session. Failed reconciliation is explicitly retryable.

Repeating the same successful import adds no evidence/analyses or graph jobs. No existing records are overwritten. New evidence is analyzed but **not blockchain-registered**: register selected evidence through the normal authenticated workflow to obtain genuine receipts. QR verification identities are random opaque tokens, not deterministic receipt substitutes.

The admin reset is broad: it removes all prototype records and managed raw/export objects, including this imported pack, then restores the two classic cases. It refuses active jobs and does not erase chain history. Do not use reset merely to import or repeat this pack.

## Suggested judging flow

1. Start with the original Operation Nightfall for the concise media/upload → real chain registration → QR → analysis → cited Copilot → bilingual report flow.
2. Open Expanded Prelude to demonstrate a larger source-backed timeline/map. Filter to one CDR segment before inspecting many events; evidence IDs distinguish individual sources.
3. Inspect a financial CSV: explain source timestamps, accounts and the threshold alert as human-review signals. Open supporting evidence from the selected graph relationship.
4. Use Northbridge/related cases to explain the common participant/account lead and the shared source note. Do not describe shared names as proven identity.
5. Show Copper/River/Mirror as additional fictional investigation breadth. Use one manageable case/segment for live narration rather than scrolling all 2,500 records.
6. Register only selected evidence for an authentic integrity proof. Large-case PDF length/performance and the complete expanded-pack live browser experience have not yet been certified; use the already validated classic case for the main report pitch until revalidation.

## Reproduction and verification

The generated working-tree bundle is immediately usable without the spreadsheet-authoring dependency. Its generator is `scripts/generate_synthetic_demo.mjs` and default seed is `20260914`. Authoring uses `@oai/artifact-tool` Workbook matrices, numeric transaction amounts, stable text IDs, ISO timestamps, exact value checks, spreadsheet-error inspection and sample renders. The runtime exposes no documented CSV export; RFC4180 serialization reads the API-authored values, normalizing returned Date objects back to ISO. QA renders are diagnostic, not evidence, and are Git-ignored.

For a new exclusive output directory with a runtime resolving `@oai/artifact-tool`:

```sh
node scripts/generate_synthetic_demo.mjs --seed 20260914 --output tmp/new-synthetic-pack --runtime /absolute/path/to/runtime
```

The generator refuses to overwrite an existing directory. Same seed yields the same planned source records; a changed seed changes identities/content. The generated manifest hashes actual exported bytes, not a simulated digest.

Validated on 14 September: all 80 file hashes/content signatures and CSV counts/timezones; 2,500 unique source-record IDs and seed determinism; samples from every CSV rendered and visually inspected; additive/idempotent import and evidence-grounded snapshots in disposable SQLite and UUID-namespaced PostgreSQL databases. These import tests use filesystem storage and mocked Neo4j synchronization, not the live MinIO/Neo4j deployment. No live import or reset was performed.
