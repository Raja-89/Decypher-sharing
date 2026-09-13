// @vitest-environment jsdom
import {afterEach,describe,it,expect} from "vitest";
import {render,screen,fireEvent,cleanup} from "@testing-library/react";
import {MemoryRouter} from "react-router-dom";
import {LocaleProvider,useLocale} from "./LocaleContext";
import {CaseProvider,useCase} from "./CaseContext";
afterEach(()=>{cleanup();localStorage.clear();});
function Probe(){const {locale,setLocale}=useLocale();const {caseId}=useCase();return <><p>{caseId}</p><button onClick={()=>setLocale("hi")}>{locale}</button></>;}
describe("shared route and locale state",()=>{
  it("URL case wins over a stale selected case; Hindi persists",()=>{
    localStorage.setItem("decypher.caseId","OLD");
    render(<MemoryRouter initialEntries={["/cases/NEW/graph"]}><LocaleProvider><CaseProvider><Probe/></CaseProvider></LocaleProvider></MemoryRouter>);
    expect(screen.getByText("NEW")).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"en"}));
    expect(localStorage.getItem("ui.lang")).toBe("hi");expect(document.documentElement.lang).toBe("hi");
  });
});
