import { useEffect, useMemo, useState } from "react";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { Features } from "./components/Features";
import { HowItWorks } from "./components/HowItWorks";
import { Install } from "./components/Install";
import { Showcase } from "./components/Showcase";
import { Footer } from "./components/Footer";
import { DocsPage } from "./docs/DocsPage";
import { useLatestRelease, detectOS } from "./hooks/useLatestRelease";

interface Route {
  view: "landing" | "docs";
  docsId?: string;
  anchor?: string;
}

function parseHash(hash: string): Route {
  const docsMatch = hash.match(/^#\/docs(?:\/([a-z0-9-]+))?\/?$/i);
  if (docsMatch) return { view: "docs", docsId: docsMatch[1] };
  return { view: "landing", anchor: hash.startsWith("#") && hash.length > 1 ? hash.slice(1) : undefined };
}

export default function App() {
  const release = useLatestRelease();
  const os = useMemo(() => detectOS(), []);
  const data = release.status === "ready" ? release.data : null;
  const githubUrl = data?.htmlUrl?.replace(/\/releases.*/, "") || undefined;

  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Coming back to the landing view via a plain anchor (e.g. footer/nav
  // links that aren't #/docs...) needs a manual scroll -- the browser's
  // native "jump to fragment" fires before React has re-mounted the
  // landing sections, so it finds nothing and does nothing on its own.
  useEffect(() => {
    if (route.view !== "landing" || !route.anchor) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(route.anchor!)?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [route]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route.view]);

  if (route.view === "docs") {
    return (
      <>
        <Nav githubUrl={githubUrl} />
        <DocsPage sectionId={route.docsId} />
        <Footer githubUrl={githubUrl} />
      </>
    );
  }

  return (
    <>
      <Nav githubUrl={githubUrl} />
      <Hero os={os} release={data} />
      <Features />
      <HowItWorks />
      <Install release={data} />
      <Showcase />
      <Footer githubUrl={githubUrl} />
    </>
  );
}
