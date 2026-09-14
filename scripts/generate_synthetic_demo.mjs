/** Reproducible raw CSV/text evidence, authored through the artifact API. */
import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {buildRichPlan} from "./rich_demo_catalog.mjs";

const stories = [
  ["NIGHTFALL", "Operation Nightfall — Expanded Prelude", "ऑपरेशन नाइटफॉल — विस्तृत पूर्वकथा", ["Arjun Verma", "Raj Mehta", "Vikram Singh"], ["Connaught Place", "Gurugram Warehouse"], 400, 100],
  ["NORTHBRIDGE", "Operation Northbridge — Dispatch Trail", "ऑपरेशन नॉर्थब्रिज — प्रेषण श्रृंखला", ["Vikram Singh", "Neha Kapoor", "Maya Sethi"], ["Gurugram Warehouse", "Noida Sector 62"], 360, 90],
  ["COPPER", "Operation Copper Ledger", "ऑपरेशन कॉपर लेजर", ["Kunal Sethi", "Isha Malhotra", "Aarav Bedi"], ["Connaught Place"], 340, 85],
  ["RIVER", "Operation River Signal", "ऑपरेशन रिवर सिग्नल", ["Priya Nair", "Dev Rao", "Zoya Khan"], ["Gurugram Warehouse"], 320, 80],
  ["ORCHARD", "Operation Orchard Route", "ऑपरेशन ऑर्चर्ड रूट", ["Sana Qureshi", "Kabir Anand", "Rohan Das"], ["Noida Sector 62"], 300, 75],
  ["MIRROR", "Operation Mirror Exchange", "ऑपरेशन मिरर एक्सचेंज", ["Aarav Bedi", "Zoya Khan", "Maya Sethi"], ["Connaught Place", "Noida Sector 62"], 280, 70],
];
const sha = value => createHash("sha256").update(value).digest("hex");
const stamp = minutes => new Date(Date.UTC(2026, 8, 1, 3, 30) + minutes * 60000).toISOString();
const split = rows => [0, 1, 2].map(i => rows.slice(Math.floor(i * rows.length / 3), Math.floor((i + 1) * rows.length / 3)));

export function buildPlan(seed = 20260914) {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("Seed must be a non-negative integer.");
  const namespace = sha(String(seed)).slice(0, 10);
  let state = seed >>> 0;
  const random = () => {state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296;};
  const cases = [], evidence = [];
  for (let index = 0; index < stories.length; index++) {
    const [code, title, titleHi, cast, places, callCount, transferCount] = stories[index];
    const id = `CASE-SYN-${namespace}-${code}`;
    cases.push({id, case_number:`SYN/${seed}/${code}`, title, title_hi:titleHi, description:`Entirely fictional ${title} dataset. Source-record communications precede financial transfers; shared names/accounts are investigative leads requiring corroboration. No real subscribers or victims are represented.`, description_hi:"पूरी तरह काल्पनिक जाँच नमूना। कॉल रिकॉर्ड के बाद वित्तीय हस्तांतरण दर्ज हैं। साझा नाम और खाते केवल समीक्षा संकेत हैं, दोष का निष्कर्ष नहीं।", priority:index < 2 ? "high" : "medium", lead_investigator:"Synthetic demo investigator", created_at:stamp(22 * 24 * 60 + index * 60), cast, locations:places});
    const calls = Array.from({length:callCount}, (_, row) => {
      const caller = index * 20 + row % 6 + 1;
      const receiver = index * 20 + (row % 6 + 1 + 1 + Math.floor(random() * 4)) % 6 + 1;
      return [`SYN-${namespace}-${code}-CALL-${String(row + 1).padStart(4,"0")}`, `SYN-${String(caller).padStart(10,"0")}`, `SYN-${String(receiver).padStart(10,"0")}`, stamp(index * 1440 + row * 15), 30 + Math.floor(random() * 420), places[row % places.length], `Fictional record only; non-dialable test phone identifiers. ${cast[row % cast.length]} is named in the source context; phone ownership is not established.`];
    });
    const transfers = Array.from({length:transferCount}, (_, row) => [`SYN-${namespace}-${code}-TX-${String(row + 1).padStart(4,"0")}`, stamp(index * 1440 + 7 * 1440 + row * 20), cast[row % cast.length], index < 2 ? `SYN-SHARED-${row % 3 + 1}` : `SYN-${code}-${row % 3 + 1}`, row % 29 === 0 ? 245000 : 1000 + Math.floor(random() * 89000), "Fictional transaction. INR 200,000 is a demo review threshold, not a legal standard."]);
    const add = (tag, mime_type, extra) => evidence.push({id:`EV-SYN-${namespace}-${code}-${tag}`, case_id:id, name:`${code.toLowerCase()}-${tag.toLowerCase()}.${mime_type === "text/csv" ? "csv" : "txt"}`, mime_type, description:"Entirely synthetic demonstration evidence. No real investigative records.", created_at:stamp(22 * 1440 + index * 60), path:`artifacts/${code.toLowerCase()}/${tag.toLowerCase()}.${mime_type === "text/csv" ? "csv" : "txt"}`, ...extra});
    split(calls).forEach((rows,i) => add(`CDR-${i+1}`, "text/csv", {headers:["record_id","caller","receiver","start_time","duration_seconds","tower_location","source_note"], rows, recordKind:"call"}));
    split(transfers).forEach((rows,i) => add(`FIN-${i+1}`, "text/csv", {headers:["transaction_id","timestamp","from_entity","to_account","amount_inr","source_note"], rows, recordKind:"transfer"}));
    const subjects = ["intake-log","witness-note","account-review","location-review","communications-review","cross-case-review","investigator-summary", "corroboration-check"];
    subjects.slice(0,index < 2 ? 8 : 7).forEach((subject,i) => add(`DOC-${i+1}`, "text/plain", {text:["SYNTHETIC EVIDENCE — DECYPHER BY EPOCH", title, `Source ID: SYN-${namespace}-${code}-${subject}`, `Recorded intake: ${stamp(22 * 1440 + index * 60)}`, `Subject: ${subject}`, `Named fictional participants: ${cast.join(", ")}.`, `Source locations: ${places.join("; ")}.`, `Call-detail exports contain ${callCount} records; financial exports contain ${transferCount} transfers.`, "Communications occur before the financial export events. Consult each CSV's timezone-bearing source timestamps.", index < 2 ? "Review bridge: Vikram Singh and shared synthetic account codes occur in the Nightfall/Northbridge prelude datasets. This is a source mention, not proof of identity or guilt." : "Shared fictional participants in Copper/River/Mirror are leads for corroboration, not conclusions.", "Non-dialable SYN-prefixed phone codes are illustrative identifiers, not real subscriber numbers.", "No computer vision, transcription, blockchain confirmation or legal finding is asserted by this document.", "हिंदी सारांश: यह काल्पनिक स्रोत टिप्पणी है। मूल रिकॉर्ड, समय और साक्ष्य पहचान जाँचना आवश्यक है।", "Human review and corroboration are mandatory.", ""].join("\n")}));
  }
  const links = [[0,1],[2,5],[3,5]].map(([from,to]) => ({evidence_id:evidence.find(e => e.case_id === cases[from].id && e.path.endsWith("doc-6.txt")).id, case_id:cases[to].id}));
  return {formatVersion:1, fictional:true, seed, cases, evidence, links, expected:{cases:6,evidence:80,callRecords:2000,financialRecords:500}};
}

function csvText(matrix) {
  // No CSV export is documented in this artifact runtime. Serialize the API's
  // authored values using RFC-4180 quoting; never infer formulas or numbers.
  const escape = v => {const s=String(v ?? "");return /[",\r\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s;};
  return matrix.map(row => row.map(escape).join(",")).join("\r\n") + "\r\n";
}

export async function exportPlan(plan, Workbook, outputDir) {
  await fs.mkdir(outputDir); // Exclusive new directory: no silent overwrite.
  const manifest = {...plan, evidence:[]};
  let previews = 0;
  for (const entry of plan.evidence) {
    const target = path.join(outputDir, entry.path);
    await fs.mkdir(path.dirname(target), {recursive:true});
    if(entry.asset){manifest.evidence.push({...entry,sha256:null,size:0,rowCount:0});continue;}
    let payload;
    if (entry.rows) {
      const workbook = Workbook.create();
      const sheet = workbook.worksheets.add("Source");
      const matrix = [entry.headers,...entry.rows];
      const range = sheet.getRangeByIndexes(0,0,matrix.length,entry.headers.length);
      range.values = matrix;
      range.format.font = {name:"Arial",size:10};
      range.format.columnWidth = 28;
      range.format.rowHeight = 22;
      sheet.getRangeByIndexes(0,0,matrix.length,1).format.columnWidth = 45;
      if(entry.recordKind!=="entity")sheet.getRangeByIndexes(1,entry.recordKind === "call" ? 3 : 1,entry.rows.length,1).setNumberFormat('yyyy-mm-dd"T"hh:mm:ss"Z"');
      sheet.showGridLines = false;
      sheet.getRangeByIndexes(0,0,1,entry.headers.length).format = {fill:"#172d61",font:{name:"Arial",bold:true,color:"#ffffff"}};
      sheet.freezePanes.freezeRows(1);
      if (entry.recordKind === "transfer") sheet.getRangeByIndexes(1,4,entry.rows.length,1).setNumberFormat("#,##0.00");
      workbook.recalculate();
      // The API may return ISO timestamp cells as Date objects. Preserve the
      // source's timezone-bearing ISO representation, never locale toString().
      const authored = range.values.map(row => row.map(value => value instanceof Date ? value.toISOString() : value));
      if (JSON.stringify(authored) !== JSON.stringify(matrix)) throw new Error(`Identity/value drift in ${entry.id}`);
      const errors = await workbook.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!",options:{useRegex:true,maxResults:10},maxChars:500});
      if (errors.ndjson.includes('"kind":"match"')) throw new Error(`Unexpected spreadsheet error in ${entry.id}`);
      payload = Buffer.from(csvText(authored));
      const preview = await workbook.render({sheetName:"Source",range:entry.recordKind==="entity"?"A1:C4":entry.recordKind==="transfer"?"A1:E4":"A1:D4",scale:1,format:"png"});
      await fs.mkdir(path.join(outputDir,"qa"),{recursive:true});
      await fs.writeFile(path.join(outputDir,"qa",`${entry.id}.png`),new Uint8Array(await preview.arrayBuffer()));
      previews++;
    } else payload = Buffer.from(entry.text);
    await fs.writeFile(target,payload,{flag:"wx"});
    const {rows,headers,text,...metadata}=entry;
    manifest.evidence.push({...metadata,sha256:sha(payload),size:payload.length,rowCount:rows?.length ?? 0});
  }
  await fs.writeFile(path.join(outputDir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{flag:"wx"});
  await fs.writeFile(path.join(outputDir,"README.md"),`# Synthetic investigation pack\n\nEntirely fictional: ${plan.expected.cases} cases, ${plan.expected.evidence} evidence artifacts, ${plan.expected.callRecords} calls and ${plan.expected.financialRecords} transactions. No blockchain confirmations are generated. Source statements, staged diagrams, tone audio and authored transcripts are explicitly labeled; they are not real recordings or model recognition.\n\nUse the manifest and explicit backend loader; nothing is automatically loaded into your running demo. QA images are diagnostics, not evidence.\n`,{flag:"wx"});
  console.log(JSON.stringify({...plan.expected,csvFiles:previews,outputDir}));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const option = name => {const i=process.argv.indexOf(name);return i>=0 ? process.argv[i+1] : undefined;};
  const plan = option("--profile") === "realistic" ? buildRichPlan(Number(option("--seed") ?? 20260915)) : buildPlan(Number(option("--seed") ?? 20260914));
  const outputDir = path.resolve(option("--output") ?? "data/demo/expanded-v1");
  const runtime = path.resolve(option("--runtime") ?? "tmp/synthetic-runtime");
  const require = createRequire(path.join(runtime,"package.json"));
  const {Workbook} = await import(pathToFileURL(require.resolve("@oai/artifact-tool")).href);
  await exportPlan(plan,Workbook,outputDir);
}
