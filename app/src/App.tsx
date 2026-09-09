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
import { Settings } from "./pages/Settings";

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
        </div>
      </div>
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
