import {it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {caseAnswer,rankNodes,CaseSnapshot} from "./caseData";
const data:CaseSnapshot=JSON.parse(readFileSync(new URL("../../public/demo/nightfall-snapshot.json",import.meta.url),"utf8"));
it("rankings derive from stored relationships and citations resolve",()=>{
  const ranked=rankNodes(data);expect(ranked[0].degree).toBeGreaterThan(0);
  const result=caseAnswer(data,"Vikram Singh relationships","hi");expect(result.citations).toContain("EV-2026-0007");
  expect(result.citations.every(id=>data.evidence.some(e=>e.id===id))).toBe(true);
});
it("empty cases produce no fabricated evidence or confidence",()=>{
  const result=caseAnswer({...data,nodes:[],edges:[],evidence:[]},"Case summary","en");expect(result.citations).toEqual([]);expect(result.confidence).toBe(0);
});
