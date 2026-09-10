import { AppProvider, useApp } from "./context/AppContext";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { Welcome } from "./pages/Welcome";
import { ProxyIntercept } from "./pages/ProxyIntercept";
import { HttpHistory } from "./pages/HttpHistory";
import { Repeater } from "./pages/Repeater";
import { Decoder } from "./pages/Decoder";
import { Capture } from "./pages/Capture";
import { Cracker } from "./pages/Cracker";
import { CurlBuilder } from "./pages/CurlBuilder";
import { Crawler } from "./pages/Crawler";
import { JwtTool } from "./pages/JwtTool";
import { Ai } from "./pages/Ai";
import { Findings } from "./pages/Findings";
import { Comparer } from "./pages/Comparer";
import { Identities } from "./pages/Identities";
import { Fuzzer } from "./pages/Fuzzer";
import { Race } from "./pages/Race";
import { Chain } from "./pages/Chain";
import { Oob } from "./pages/Oob";
import { Settings } from "./pages/Settings";
import { CommandPalette } from "./components/CommandPalette";
import { OnboardingTour } from "./components/OnboardingTour";

function Shell() {
  const { page } = useApp();
  return (
    <div className="app-shell">
      <TitleBar />
      <div className="layout">
        <Sidebar />
        <div className="content">
          <div className="content-narrow" style={{ display: page === "welcome" || page === "settings" ? "block" : "none" }}>
            {page === "welcome" && <Welcome />}
            {page === "settings" && <Settings />}
          </div>
          {page === "proxy" && <ProxyIntercept />}
          {page === "history" && <HttpHistory />}
          {page === "repeater" && <Repeater />}
          {page === "decoder" && <Decoder />}
          {page === "capture" && <Capture />}
          {page === "cracker" && <Cracker />}
          {page === "curl" && <CurlBuilder />}
          {page === "crawler" && <Crawler />}
          {page === "jwt" && <JwtTool />}
          {page === "comparer" && <Comparer />}
          {page === "identities" && <Identities />}
          {page === "fuzzer" && <Fuzzer />}
          {page === "race" && <Race />}
          {page === "chain" && <Chain />}
          {page === "oob" && <Oob />}
          {page === "ai" && <Ai />}
          {page === "findings" && <Findings />}
        </div>
      </div>
      <CommandPalette />
      <OnboardingTour />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
