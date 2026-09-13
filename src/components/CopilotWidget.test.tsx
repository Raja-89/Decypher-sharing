// @vitest-environment jsdom
import {afterEach,it,expect,vi} from "vitest";
import {render,screen,fireEvent,cleanup,act} from "@testing-library/react";
import {LocaleProvider} from "../context/LocaleContext";
import CopilotWidget from "./CopilotWidget";
const state=vi.hoisted(()=>({caseId:"CASE-A",copilot:vi.fn()}));
vi.mock("../context/CaseContext",()=>({useCase:()=>({caseId:state.caseId})}));
vi.mock("../lib/api",()=>({appMode:"full",api:{copilot:state.copilot}}));
afterEach(()=>{cleanup();localStorage.clear();state.caseId="CASE-A";state.copilot.mockReset();});
const result={answer:"Cited synthetic answer",confidence:.9,reasoning:"Evidence only",citations:["EV-A"]};
function widget(){return <LocaleProvider><CopilotWidget onNavigate={vi.fn()}/></LocaleProvider>;}
it("keeps the current case's citations when closed and reopened",async()=>{
  state.copilot.mockResolvedValue(result);render(widget());
  fireEvent.click(screen.getByRole("button",{name:"Open Copilot"}));
  fireEvent.change(screen.getByLabelText("Copilot question"),{target:{value:"Synthetic question"}});
  fireEvent.click(screen.getByRole("button",{name:"Send"}));
  expect(await screen.findByRole("button",{name:"EV-A"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Close Copilot"}));expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Open Copilot"}));expect(screen.getByRole("button",{name:"EV-A"})).toBeTruthy();
});
it("clears a switched case and ignores a late previous-case answer",async()=>{
  let resolve!:(value:typeof result)=>void;
  state.copilot.mockReturnValue(new Promise(r=>{resolve=r;}));const view=render(widget());
  fireEvent.click(screen.getByRole("button",{name:"Open Copilot"}));fireEvent.click(screen.getByRole("button",{name:"Raj Mehta evidence"}));
  expect(state.copilot).toHaveBeenCalledWith("CASE-A","Raj Mehta evidence","en");
  state.caseId="CASE-B";view.rerender(widget());expect(screen.getByRole("dialog").textContent).toContain("CASE-B");
  await act(async()=>{resolve(result);});
  expect(screen.queryByRole("button",{name:"EV-A"})).toBeNull();expect(screen.queryByText("Cited synthetic answer")).toBeNull();
  expect((screen.getByRole("button",{name:"Raj Mehta evidence"}) as HTMLButtonElement).disabled).toBe(false);
});
