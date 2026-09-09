import axios, { AxiosResponse } from "axios";
import * as cheerio from "cheerio";
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { URL } from "url";
import { CrawlerEvent, CrawlerRequest } from "../types";

const COMMON_PATHS = [
  "robots.txt",
  "sitemap.xml",
  ".git/HEAD",
  ".env",
  "admin",
  "login",
  "api",
  "api/swagger.json",
  "graphql",
  ".well-known/security.txt",
  "wp-login.php",
  "backup.zip",
];

interface QueueItem {
  url: string;
  depth: number;
}

/**
 * Small, dependency-light BFS crawler. It intentionally does not execute
 * JavaScript (no headless browser) -- it's meant as a fast "map the
 * static attack surface" pass, not a full SPA renderer, which keeps it
 * trivial to install (no bundled Chromium) and fast to run.
 */
export class Crawler extends EventEmitter {
  readonly jobId = randomUUID();
  private stopped = false;
  private visited = new Set<string>();
  private discovered = new Set<string>();

  stop() {
    this.stopped = true;
  }

  async run(req: CrawlerRequest): Promise<void> {
    let baseHost: string;
    try {
      baseHost = new URL(req.startUrl).hostname;
    } catch {
      this.emit("event", { jobId: this.jobId, type: "error", message: "Invalid start URL" } as CrawlerEvent);
      return;
    }

    const queue: QueueItem[] = [{ url: req.startUrl, depth: 0 }];
    this.discovered.add(req.startUrl);

    if (req.techniques.robotsTxt) this.enqueueFrom(queue, req.startUrl, "robots.txt");
    if (req.techniques.sitemapXml) this.enqueueFrom(queue, req.startUrl, "sitemap.xml");
    if (req.techniques.commonPaths) {
      for (const p of COMMON_PATHS) this.enqueueFrom(queue, req.startUrl, p);
    }

    let inFlight = 0;
    let idx = 0;

    await new Promise<void>((resolve) => {
      const pump = () => {
        if (this.stopped) return resolve();
        if (idx >= queue.length && inFlight === 0) return resolve();
        if (this.visited.size >= req.maxPages) return resolve();

        while (inFlight < req.concurrency && idx < queue.length && this.visited.size < req.maxPages) {
          const item = queue[idx++];
          if (this.visited.has(item.url) || item.depth > req.maxDepth) continue;
          this.visited.add(item.url);
          inFlight++;
          this.visitOne(item, req, baseHost, queue)
            .catch(() => undefined)
            .finally(() => {
              inFlight--;
              this.emit("event", {
                jobId: this.jobId,
                type: "progress",
                visited: this.visited.size,
                discovered: this.discovered.size,
              } as CrawlerEvent);
              pump();
            });
        }
      };
      pump();
    });

    this.emit("event", {
      jobId: this.jobId,
      type: "done",
      visited: this.visited.size,
      discovered: this.discovered.size,
    } as CrawlerEvent);
  }

  private enqueueFrom(queue: QueueItem[], startUrl: string, relPath: string) {
    try {
      const u = new URL(relPath, startUrl).toString();
      if (!this.discovered.has(u)) {
        this.discovered.add(u);
        queue.push({ url: u, depth: 0 });
      }
    } catch {
      /* ignore malformed */
    }
  }

  private async visitOne(item: QueueItem, req: CrawlerRequest, baseHost: string, queue: QueueItem[]): Promise<void> {
    let res: AxiosResponse<string>;
    try {
      res = await axios.get<string>(item.url, {
        timeout: 12000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: { "User-Agent": "Wraith/1.0 (+web-crawler)" },
        responseType: "text",
        maxContentLength: 15 * 1024 * 1024,
      });
    } catch (err: any) {
      this.emit("event", {
        jobId: this.jobId,
        type: "error",
        url: item.url,
        message: err?.message || String(err),
      } as CrawlerEvent);
      return;
    }

    const contentType = String(res.headers["content-type"] || "");
    this.emit("event", {
      jobId: this.jobId,
      type: "found",
      url: item.url,
      status: res.status,
      contentType,
      depth: item.depth,
    } as CrawlerEvent);

    if (item.depth >= req.maxDepth) return;
    if (!contentType.includes("html") && !contentType.includes("xml")) return;
    if (typeof res.data !== "string") return;

    const links = new Set<string>();

    if (contentType.includes("xml")) {
      const locMatches = res.data.match(/<loc>([^<]+)<\/loc>/g) || [];
      for (const m of locMatches) links.add(m.replace(/<\/?loc>/g, "").trim());
    } else {
      const $ = cheerio.load(res.data);
      $("a[href]").each((_, el) => {
        links.add(String($(el).attr("href")));
      });
      if (req.techniques.forms) {
        $("form[action]").each((_, el) => {
          links.add(String($(el).attr("action")));
        });
      }
      if (req.techniques.jsFiles) {
        $("script[src]").each((_, el) => {
          links.add(String($(el).attr("src")));
        });
      }
      if (req.techniques.comments) {
        const commentUrls = res.data.match(/<!--[\s\S]*?-->/g) || [];
        for (const c of commentUrls) {
          const urlIn = c.match(/https?:\/\/[^\s"'<>]+/g) || [];
          for (const u of urlIn) links.add(u);
        }
      }
    }

    for (const href of links) {
      if (!href) continue;
      let abs: URL;
      try {
        abs = new URL(href, item.url);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(abs.protocol)) continue;
      abs.hash = "";
      const inScope = req.scopeHost
        ? abs.hostname === baseHost || (req.followSubdomains && abs.hostname.endsWith(`.${baseHost}`))
        : true;
      if (!inScope) continue;
      const norm = abs.toString();
      if (!this.discovered.has(norm)) {
        this.discovered.add(norm);
        queue.push({ url: norm, depth: item.depth + 1 });
      }
    }
  }
}
