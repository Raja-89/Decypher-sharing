import {api,appMode,ApiEvidence,authorizedFetch} from "./api";
export interface CaseNode {id:string;label:string;labelHi?:string;type:string;properties:Record<string,unknown>;evidenceIds:string[]}
export interface CaseEdge {id:string;source:string;target:string;type:string;confidence:number;evidenceIds:string[];timestamp:string}
export interface CaseEvent {id:string;timestamp:string;type:string;title:string;titleHi?:string;description:string;entityIds:string[];evidenceIds:string[];confidence:number;location?:{name:string;lat:number;lng:number}}
export interface CaseSnapshot {
  case:{id:string;title:string;title_hi?:string;description:string;description_hi?:string;priority:string;lead_investigator:string};
  evidence:ApiEvidence[];nodes:CaseNode[];edges:CaseEdge[];timeline:CaseEvent[];
  alerts:Array<{id:string;title:string;reason:string;evidenceIds:string[];confidence:number}>;
  custody:Array<{evidenceId:string;event:string;from:string;to:string;timestamp:string;location:string;notes:string}>;
  anchors:Array<{evidenceId:string;transactionHash:string;blockNumber:number;contractAddress:string}>;
  reports:Array<{id:string;locale:string;createdAt:string;downloadUrl:string}>;
}
export const demoPaths:Record<string,string>={"EV-2026-0001":"/demo/nightfall-fir.pdf","EV-2026-0002":"/demo/nightfall-cdr.csv","EV-2026-0003":"/demo/nightfall-transactions.csv","EV-2026-0004":"/demo/nightfall-cctv-still.png","EV-2026-0005":"/demo/nightfall-audio.wav","EV-2026-0006":"/demo/nightfall-cctv.mp4","EV-2026-0007":"/demo/nightfall-investigation-note.txt"};
export async function loadSnapshot(id:string):Promise<CaseSnapshot> {
  if(appMode==="full") return api.snapshot(id);
  if(!["CASE-2026-017","CASE-X007"].includes(id)) throw new Error("This case is not in the public showcase. Local secure service required.");
  const response=await fetch(`/demo/${id==="CASE-X007"?"northbridge":"nightfall"}-snapshot.json`);
  if(!response.ok)throw new Error("Demo story could not be loaded.");return response.json();
}
export async function loadCases() {
  if(appMode==="full")return api.listCases();
  return Promise.all(["CASE-2026-017","CASE-X007"].map(async id=>(await loadSnapshot(id)).case));
}
export async function downloadProtected(url:string,name:string) {
  const response=await authorizedFetch(url,{},appMode==="full");
  if(!response.ok)throw new Error("Download failed; sign in or check the local service.");
  const objectUrl=URL.createObjectURL(await response.blob());const a=document.createElement("a");a.href=objectUrl;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}
export function rankNodes(data:CaseSnapshot) {
  return data.nodes.map(node=>({...node,degree:data.edges.filter(e=>e.source===node.id||e.target===node.id).length})).sort((a,b)=>b.degree-a.degree);
}
export function caseAnswer(data:CaseSnapshot,question:string,locale:string) {
  const lower=question.toLowerCase();const chosen=data.nodes.find(n=>lower.includes(n.label.toLowerCase())||lower.includes(n.id.toLowerCase())||(n.labelHi&&question.includes(n.labelHi)));
  const related=chosen?data.edges.filter(e=>e.source===chosen.id||e.target===chosen.id):data.edges.slice(0,3);
  const citations=[...new Set(related.flatMap(r=>r.evidenceIds))].filter(id=>data.evidence.some(e=>e.id===id));
  return {answer:locale==="hi"?`${chosen?.labelHi||chosen?.label||data.case.title_hi||data.case.title}: ${related.length} साक्ष्य-समर्थित संबंध। यह समीक्षा संकेत है, दोष का निष्कर्ष नहीं।`:`${chosen?.label||data.case.title}: ${related.length} evidence-backed relationships. This is a review lead, not a conclusion of guilt.`,confidence:citations.length ? .9 : 0,reasoning:locale==="hi"?"उत्तर केवल चयनित केस और संलग्न साक्ष्य से तैयार है।":"Derived only from the selected case and resolvable evidence citations.",citations};
}
