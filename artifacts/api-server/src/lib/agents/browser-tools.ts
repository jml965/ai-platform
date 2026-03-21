import puppeteer, { type Browser, type Page } from "puppeteer-core";
import * as fs from "fs";

function findChromiumPath(): string {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/nix/store/5afrhwm7zqn1vb7p5z1mc2rkh2grsfgz-ungoogled-chromium-138.0.7204.100/bin/chromium",
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return "/usr/bin/chromium";
}

const CHROMIUM_PATH = findChromiumPath();

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.connected) return browserInstance;
  browserInstance = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
    ],
  });
  return browserInstance;
}

function resolveUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  const p = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  if (process.env.NODE_ENV === "production") {
    const port = process.env.PORT || "8080";
    return `http://localhost:${port}${p}`;
  }
  const domain =
    process.env.REPLIT_DEV_DOMAIN ||
    process.env.REPLIT_DOMAINS ||
    "localhost:5173";
  return `https://${domain}${p}`;
}

export async function screenshotPage(
  pathOrUrl: string,
  opts?: { width?: number; height?: number; fullPage?: boolean; selector?: string }
): Promise<{ base64: string; width: number; height: number }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const w = opts?.width || 1280;
  const h = opts?.height || 720;
  try {
    await page.setViewport({ width: w, height: h });
    await page.goto(resolveUrl(pathOrUrl), {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1500));

    let screenshotBuffer: Buffer;
    if (opts?.selector) {
      const el = await page.$(opts.selector);
      if (!el) throw new Error(`Selector "${opts.selector}" not found on page`);
      screenshotBuffer = (await el.screenshot({ type: "png" })) as Buffer;
    } else {
      screenshotBuffer = (await page.screenshot({
        type: "png",
        fullPage: opts?.fullPage || false,
      })) as Buffer;
    }
    return {
      base64: screenshotBuffer.toString("base64"),
      width: w,
      height: h,
    };
  } finally {
    await page.close();
  }
}

export async function clickElement(
  pathOrUrl: string,
  selector: string
): Promise<{ success: boolean; screenshotAfter: string; message: string }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(resolveUrl(pathOrUrl), {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1000));

    const el = await page.$(selector);
    if (!el) {
      const shot = (await page.screenshot({ type: "png" })) as Buffer;
      return {
        success: false,
        screenshotAfter: shot.toString("base64"),
        message: `Element "${selector}" not found on page`,
      };
    }

    await el.click();
    await new Promise((r) => setTimeout(r, 2000));

    const shot = (await page.screenshot({ type: "png" })) as Buffer;
    return {
      success: true,
      screenshotAfter: shot.toString("base64"),
      message: `Clicked "${selector}" successfully`,
    };
  } finally {
    await page.close();
  }
}

export async function typeIntoElement(
  pathOrUrl: string,
  selector: string,
  text: string
): Promise<{ success: boolean; screenshotAfter: string; message: string }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(resolveUrl(pathOrUrl), {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1000));

    const el = await page.$(selector);
    if (!el) {
      const shot = (await page.screenshot({ type: "png" })) as Buffer;
      return {
        success: false,
        screenshotAfter: shot.toString("base64"),
        message: `Element "${selector}" not found`,
      };
    }

    await el.click({ clickCount: 3 });
    await el.type(text, { delay: 30 });
    await new Promise((r) => setTimeout(r, 1000));

    const shot = (await page.screenshot({ type: "png" })) as Buffer;
    return {
      success: true,
      screenshotAfter: shot.toString("base64"),
      message: `Typed "${text}" into "${selector}"`,
    };
  } finally {
    await page.close();
  }
}

export async function inspectStyles(
  pathOrUrl: string,
  selector: string
): Promise<{
  found: boolean;
  styles: Record<string, string>;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  text: string;
  tagName: string;
}> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(resolveUrl(pathOrUrl), {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1000));

    const result = await page.evaluate((sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        tagName: el.tagName.toLowerCase(),
        text: (el as HTMLElement).innerText?.slice(0, 500) || "",
        boundingBox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        styles: {
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          fontFamily: cs.fontFamily,
          border: cs.border,
          borderRadius: cs.borderRadius,
          padding: cs.padding,
          margin: cs.margin,
          display: cs.display,
          position: cs.position,
          opacity: cs.opacity,
          visibility: cs.visibility,
          width: cs.width,
          height: cs.height,
          boxShadow: cs.boxShadow,
          textAlign: cs.textAlign,
          lineHeight: cs.lineHeight,
        },
      };
    }, selector);

    if (!result) {
      return {
        found: false,
        styles: {},
        boundingBox: null,
        text: "",
        tagName: "",
      };
    }

    return { found: true, ...result };
  } finally {
    await page.close();
  }
}

export async function getPageStructure(
  pathOrUrl: string
): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(resolveUrl(pathOrUrl), {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1500));

    const structure = await page.evaluate(() => {
      const results: string[] = [];

      document.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((h) => {
        results.push(`${h.tagName}: ${(h as HTMLElement).innerText.trim().slice(0, 100)}`);
      });

      results.push("---LINKS---");
      document.querySelectorAll("a[href]").forEach((a) => {
        const text = (a as HTMLElement).innerText.trim().slice(0, 60);
        const href = a.getAttribute("href") || "";
        if (text) results.push(`[${text}](${href})`);
      });

      results.push("---BUTTONS---");
      document.querySelectorAll("button").forEach((b) => {
        const text = (b as HTMLElement).innerText.trim().slice(0, 60);
        const cls = b.className.slice(0, 80);
        if (text) results.push(`<button class="${cls}">${text}</button>`);
      });

      results.push("---INPUTS---");
      document.querySelectorAll("input,textarea,select").forEach((el) => {
        const inp = el as HTMLInputElement;
        results.push(
          `<${el.tagName.toLowerCase()} type="${inp.type || ""}" name="${inp.name || ""}" placeholder="${inp.placeholder || ""}">`
        );
      });

      results.push("---IMAGES---");
      document.querySelectorAll("img").forEach((img) => {
        const src = img.getAttribute("src") || "";
        const alt = img.getAttribute("alt") || "";
        results.push(`<img alt="${alt}" src="${src.slice(0, 100)}">`);
      });

      results.push("---COLORS---");
      const body = document.body;
      const bodyCS = window.getComputedStyle(body);
      results.push(`body bg: ${bodyCS.backgroundColor}`);
      results.push(`body color: ${bodyCS.color}`);

      const main = document.querySelector("main") || document.querySelector("#root") || document.querySelector(".app");
      if (main) {
        const mainCS = window.getComputedStyle(main);
        results.push(`main bg: ${mainCS.backgroundColor}`);
        results.push(`main color: ${mainCS.color}`);
      }

      return results.join("\n");
    });

    return structure;
  } finally {
    await page.close();
  }
}

export async function scrollAndScreenshot(
  pathOrUrl: string,
  direction: "down" | "up" | "to-element",
  selectorOrPixels?: string | number
): Promise<{ base64: string; scrollY: number; pageHeight: number }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(resolveUrl(pathOrUrl), {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1000));

    if (direction === "to-element" && typeof selectorOrPixels === "string") {
      const el = await page.$(selectorOrPixels);
      if (el) {
        await el.scrollIntoView();
        await new Promise((r) => setTimeout(r, 500));
      }
    } else {
      const px = typeof selectorOrPixels === "number" ? selectorOrPixels : 600;
      await page.evaluate(
        (dir: string, amount: number) => {
          window.scrollBy(0, dir === "down" ? amount : -amount);
        },
        direction,
        px
      );
      await new Promise((r) => setTimeout(r, 500));
    }

    const { scrollY, pageHeight } = await page.evaluate(() => ({
      scrollY: window.scrollY,
      pageHeight: document.documentElement.scrollHeight,
    }));

    const shot = (await page.screenshot({ type: "png" })) as Buffer;
    return {
      base64: shot.toString("base64"),
      scrollY,
      pageHeight,
    };
  } finally {
    await page.close();
  }
}

export async function hoverElement(
  pathOrUrl: string,
  selector: string
): Promise<{ success: boolean; screenshotAfter: string; message: string }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(resolveUrl(pathOrUrl), {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 1000));

    const el = await page.$(selector);
    if (!el) {
      const shot = (await page.screenshot({ type: "png" })) as Buffer;
      return {
        success: false,
        screenshotAfter: shot.toString("base64"),
        message: `Element "${selector}" not found`,
      };
    }

    await el.hover();
    await new Promise((r) => setTimeout(r, 800));

    const shot = (await page.screenshot({ type: "png" })) as Buffer;
    return {
      success: true,
      screenshotAfter: shot.toString("base64"),
      message: `Hovered over "${selector}"`,
    };
  } finally {
    await page.close();
  }
}

export async function getConsoleErrors(
  pathOrUrl: string
): Promise<{ errors: string[]; warnings: string[]; logs: string[] }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const errors: string[] = [];
  const warnings: string[] = [];
  const logs: string[] = [];

  try {
    page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error") errors.push(text);
      else if (type === "warning") warnings.push(text);
      else logs.push(text);
    });

    page.on("pageerror", (err) => {
      errors.push(`PageError: ${err.message}`);
    });

    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(resolveUrl(pathOrUrl), {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 3000));

    return {
      errors: errors.slice(0, 50),
      warnings: warnings.slice(0, 30),
      logs: logs.slice(0, 30),
    };
  } finally {
    await page.close();
  }
}

export async function getNetworkRequests(
  pathOrUrl: string
): Promise<{ requests: Array<{ url: string; method: string; status: number; type: string; size: number }> }> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const requests: Array<{ url: string; method: string; status: number; type: string; size: number }> = [];

  try {
    await page.setViewport({ width: 1280, height: 720 });

    page.on("response", async (response) => {
      try {
        const req = response.request();
        const headers = response.headers();
        const size = parseInt(headers["content-length"] || "0", 10);
        requests.push({
          url: req.url().slice(0, 200),
          method: req.method(),
          status: response.status(),
          type: req.resourceType(),
          size,
        });
      } catch {}
    });

    await page.goto(resolveUrl(pathOrUrl), {
      waitUntil: "networkidle2",
      timeout: 20000,
    });
    await new Promise((r) => setTimeout(r, 2000));

    return { requests: requests.slice(0, 100) };
  } finally {
    await page.close();
  }
}

export function closeBrowser() {
  if (browserInstance) {
    browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}
