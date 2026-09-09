import { useMemo } from "react";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { Features } from "./components/Features";
import { HowItWorks } from "./components/HowItWorks";
import { Install } from "./components/Install";
import { Showcase } from "./components/Showcase";
import { Footer } from "./components/Footer";
import { useLatestRelease, detectOS } from "./hooks/useLatestRelease";

export default function App() {
  const release = useLatestRelease();
  const os = useMemo(() => detectOS(), []);
  const data = release.status === "ready" ? release.data : null;

  return (
    <>
      <Nav githubUrl={data?.htmlUrl?.replace(/\/releases.*/, "") || undefined} />
      <Hero os={os} release={data} />
      <Features />
      <HowItWorks />
      <Install release={data} />
      <Showcase />
      <Footer githubUrl={data?.htmlUrl?.replace(/\/releases.*/, "") || undefined} />
    </>
  );
}
