import {createContext,useContext,useEffect,useState} from "react";
import {useLocation} from "react-router-dom";
const Context=createContext({caseId:"CASE-2026-017",selectCase:(_id:string)=>{}});
export function CaseProvider({children}:{children:React.ReactNode}) {
  const location=useLocation();
  const routeId=location.pathname.match(/^\/cases\/([^/]+)/)?.[1] || new URLSearchParams(location.search).get("caseId");
  const [selected,setSelected]=useState(()=>localStorage.getItem("decypher.caseId") || "CASE-2026-017");
  const caseId=routeId ? decodeURIComponent(routeId) : selected;
  const selectCase=(id:string)=>{setSelected(id);localStorage.setItem("decypher.caseId",id);};
  useEffect(()=>{selectCase(caseId);},[caseId]);
  return <Context.Provider value={{caseId,selectCase}}>{children}</Context.Provider>;
}
export const useCase=()=>useContext(Context);
