import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import CypherNavbar from "./components/CypherNavbar";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CaseList from "./pages/CaseList";
import CaseDetail from "./pages/CaseDetail";
import PersonProfile from "./pages/PersonProfile";
import GraphPage from "./pages/GraphPage";
import MapPage from "./pages/MapPage";
import TimelinePage from "./pages/TimelinePage";
import FinancialPage from "./pages/FinancialPage";
import EvidencePage from "./pages/EvidencePage";
import EvidenceDetail from "./pages/EvidenceDetail";
import VerifyPage from "./pages/VerifyPage";
import NetworkPage from "./pages/NetworkPage";
import ReportsPage from "./pages/ReportsPage";
import DemoGuide from "./pages/DemoGuide";
import Capabilities from "./pages/Capabilities";
import HowItWorks from "./pages/HowItWorks";
import Security from "./pages/Security";
import About from "./pages/About";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import CopilotWidget from "./components/CopilotWidget";
import GovFooter from "./components/GovFooter";
import { appMode, clearSession, currentSession, api, logout } from "./lib/api";
import { useCase } from "./context/CaseContext";
import CaseWorkspace from "./pages/CaseWorkspace";
import CaseRegistry from "./pages/CaseRegistry";
import EvidenceRecord from "./pages/EvidenceRecord";
import PublicPortal from "./pages/PublicPortal";
import { useLocale } from "./context/LocaleContext";

type Role = "investigator" | "senior" | "forensics" | "admin";
type NavigateFn = (page: string, param?: string) => void;
const publicPaths = new Set(["/", "/login", "/capabilities", "/how-it-works", "/security", "/about", "/terms", "/privacy"]);

function pageForPath(path: string) {
  if (path === "/") return "landing";
  if (path.startsWith("/cases/") && path.split("/").length === 3) return "case-detail";
  if (path.startsWith("/cases/")) return path.split("/")[3] || "case-detail";
  if (path.startsWith("/entities/")) return "person";
  if (path.startsWith("/evidence/")) return "evidence";
  if (path.startsWith("/verify/")) return "verify";
  return path.split("/")[1] || "landing";
}

function Protected({ authenticated, children }: { authenticated: boolean; children: React.ReactNode }) {
  return authenticated ? children : <Navigate to="/login" replace state={{ reason: "protected" }} />;
}

export default function App() {
  const routerNavigate = useNavigate();
  const location = useLocation();
  const {caseId,selectCase}=useCase();
  const {locale}=useLocale();
  const stored = currentSession();
  const [isLoggedIn, setIsLoggedIn] = useState(() => appMode === "showcase" ? localStorage.getItem("decypher.showcase.auth") === "1" : Boolean(stored));
  const [userRole, setUserRole] = useState<Role>((stored?.role as Role) || "investigator");
  useEffect(()=>{const changed=()=>setIsLoggedIn(Boolean(currentSession()));window.addEventListener("decypher:session",changed);if(appMode==="full"&&stored)api.me().then(user=>{setIsLoggedIn(true);setUserRole(user.role);}).catch(()=>{clearSession();setIsLoggedIn(false);});return()=>window.removeEventListener("decypher:session",changed);},[]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [location.pathname, location.search]);

  const pathFor = (page: string, param?: string) => {
    const routes: Record<string, string> = {
      landing: "/", login: "/login", dashboard: "/dashboard", cases: "/cases",
      "case-detail": `/cases/${param || caseId}`, graph: `/cases/${caseId}/graph`, map: `/cases/${caseId}/map`,
      timeline: `/cases/${caseId}/timeline`, financial: `/cases/${caseId}/financial`, evidence: `/cases/${caseId}/evidence`, "evidence-detail": `/evidence/${param || "EV-2026-0001"}?caseId=${encodeURIComponent(caseId)}`, network: `/cases/${caseId}/network`,
      reports: `/cases/${caseId}/reports`, demo: "/demo", capabilities: "/capabilities", "how-it-works": "/how-it-works",
      security: "/security", about: "/about", terms: "/terms", privacy: "/privacy",
      person: `/entities/${param || "PERSON-P001"}?caseId=${encodeURIComponent(caseId)}`,
      verify: `/verify/${encodeURIComponent(param || "")}`,
    };
    return routes[page] || "/";
  };

  const navigate: NavigateFn = (page, param) => {if(page==="case-detail"&&param)selectCase(param);routerNavigate(pathFor(page, param));};
  const handleLogin = (role: Role) => {
    setIsLoggedIn(true); setUserRole(role);
    if (appMode === "showcase") localStorage.setItem("decypher.showcase.auth", "1");
    routerNavigate("/dashboard");
  };
  const handleLogout = async () => { try{await logout();}finally{clearSession();localStorage.removeItem("decypher.showcase.auth");setIsLoggedIn(false);routerNavigate("/");} };
  const currentPage = useMemo(() => pageForPath(location.pathname), [location.pathname]);
  const showNavbar = location.pathname !== "/login" && !location.pathname.startsWith("/verify/");
  const showFooter = publicPaths.has(location.pathname) && location.pathname !== "/login";
  const guard = (element: React.ReactNode) => <Protected authenticated={isLoggedIn}>{element}</Protected>;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-base-bg)]">
      {showNavbar && <CypherNavbar currentPage={currentPage} onNavigate={navigate} isLoggedIn={isLoggedIn} onLogout={handleLogout} userRole={userRole} />}
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Routes>
          <Route path="/" element={<PublicPortal onNavigate={navigate} />} />
          <Route path="/login" element={<Login onLogin={handleLogin} onNavigate={navigate} />} />
          {["capabilities","how-it-works","security","about","terms","privacy"].map(page=><Route key={page} path={`/${page}`} element={<PublicPortal page={page} onNavigate={navigate}/>}/>)}
          <Route path="/verify/:token" element={<VerifyPage onNavigate={navigate} />} />
          <Route path="/dashboard" element={guard(<CaseRegistry onNavigate={navigate} />)} />
          <Route path="/cases" element={guard(<CaseRegistry onNavigate={navigate} />)} />
          <Route path="/cases/:caseId" element={guard(<CaseWorkspace mode="case-detail" onNavigate={navigate} />)} />
          {["graph","map","timeline","financial","evidence","network","reports"].map(mode=><Route key={mode} path={`/cases/:caseId/${mode}`} element={guard(<CaseWorkspace mode={mode} onNavigate={navigate}/>)} />)}
          {["graph","map","timeline","financial","evidence","network","reports"].map(mode=><Route key={mode} path={`/${mode}`} element={<Navigate to={`/cases/${caseId}/${mode}${location.search}`} replace/>}/>)}
          <Route path="/evidence/:evidenceId" element={guard(<EvidenceRecord onNavigate={navigate} />)} />
          <Route path="/entities/:personId" element={guard(<CaseWorkspace mode="entities" onNavigate={navigate} />)} />
          <Route path="/demo" element={guard(<DemoGuide onNavigate={navigate} />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showFooter && <GovFooter onNavigate={navigate} />}
      {isLoggedIn && !location.pathname.startsWith("/verify/") && <CopilotWidget key={`${caseId}-${locale}`} onNavigate={navigate} />}
    </div>
  );
}

function CaseRoute({ onNavigate }: { onNavigate: NavigateFn }) {
  const { caseId = "CASE-2026-017" } = useParams();
  return <CaseDetail caseId={caseId} onNavigate={onNavigate} />;
}

function PersonRoute({ onNavigate }: { onNavigate: NavigateFn }) {
  const { personId = "PERSON-P001" } = useParams();
  return <PersonProfile personId={personId} onNavigate={onNavigate} />;
}
