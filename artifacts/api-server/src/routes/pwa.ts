import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { pwaSettingsTable, projectsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "../middlewares/permissions";

const router: IRouter = Router();

router.get("/projects/:projectId/pwa", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const [settings] = await db
      .select()
      .from(pwaSettingsTable)
      .where(eq(pwaSettingsTable.projectId, req.params.projectId))
      .limit(1);

    if (!settings) {
      res.json({
        projectId: req.params.projectId,
        enabled: false,
        appName: "My App",
        shortName: "App",
        description: null,
        themeColor: "#1f6feb",
        backgroundColor: "#ffffff",
        display: "standalone",
        orientation: "any",
        iconUrl: null,
        startUrl: "/",
        offlineEnabled: true,
      });
      return;
    }

    res.json(mapPwaSettings(settings));
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get PWA settings" } });
  }
});

router.put("/projects/:projectId/pwa", requireProjectAccess("project.edit"), async (req, res) => {
  try {
    const body = req.body;

    const VALID_DISPLAYS = ["standalone", "fullscreen", "minimal-ui", "browser"];
    const VALID_ORIENTATIONS = ["any", "natural", "landscape", "portrait"];

    if (body.display !== undefined && !VALID_DISPLAYS.includes(body.display)) {
      res.status(400).json({ error: { code: "VALIDATION", message: `display must be one of: ${VALID_DISPLAYS.join(", ")}` } });
      return;
    }
    if (body.orientation !== undefined && !VALID_ORIENTATIONS.includes(body.orientation)) {
      res.status(400).json({ error: { code: "VALIDATION", message: `orientation must be one of: ${VALID_ORIENTATIONS.join(", ")}` } });
      return;
    }
    if (body.themeColor !== undefined && typeof body.themeColor !== "string") {
      res.status(400).json({ error: { code: "VALIDATION", message: "themeColor must be a string" } });
      return;
    }
    if (body.backgroundColor !== undefined && typeof body.backgroundColor !== "string") {
      res.status(400).json({ error: { code: "VALIDATION", message: "backgroundColor must be a string" } });
      return;
    }

    const [existing] = await db
      .select()
      .from(pwaSettingsTable)
      .where(eq(pwaSettingsTable.projectId, req.params.projectId))
      .limit(1);

    const values: Record<string, unknown> = {};
    if (body.enabled !== undefined) values.enabled = !!body.enabled;
    if (body.appName !== undefined) values.appName = String(body.appName);
    if (body.shortName !== undefined) values.shortName = String(body.shortName);
    if ("description" in body) values.description = body.description === null ? null : String(body.description || "");
    if (body.themeColor !== undefined) values.themeColor = body.themeColor;
    if (body.backgroundColor !== undefined) values.backgroundColor = body.backgroundColor;
    if (body.display !== undefined) values.display = body.display;
    if (body.orientation !== undefined) values.orientation = body.orientation;
    if ("iconUrl" in body) values.iconUrl = body.iconUrl === null ? null : (body.iconUrl ? String(body.iconUrl) : null);
    if (body.startUrl !== undefined) values.startUrl = String(body.startUrl);
    if (body.offlineEnabled !== undefined) values.offlineEnabled = !!body.offlineEnabled;

    let settings;
    if (existing) {
      [settings] = await db
        .update(pwaSettingsTable)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(pwaSettingsTable.projectId, req.params.projectId))
        .returning();
    } else {
      [settings] = await db
        .insert(pwaSettingsTable)
        .values({
          projectId: req.params.projectId,
          ...values,
        })
        .returning();
    }

    res.json(mapPwaSettings(settings));
  } catch (error) {
    res.status(400).json({ error: { code: "VALIDATION", message: "Invalid PWA settings" } });
  }
});

router.get("/projects/:projectId/pwa/manifest", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const [[settings], [project]] = await Promise.all([
      db.select().from(pwaSettingsTable).where(eq(pwaSettingsTable.projectId, req.params.projectId)).limit(1),
      db.select().from(projectsTable).where(eq(projectsTable.id, req.params.projectId)).limit(1),
    ]);

    if (!settings?.enabled) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "PWA is not enabled for this project" } });
      return;
    }

    const appName = settings?.appName || project?.name || "My App";
    const shortName = settings?.shortName || project?.name || "App";

    const icons = [];
    if (settings?.iconUrl) {
      icons.push(
        { src: settings.iconUrl, sizes: "192x192", type: "image/png" },
        { src: settings.iconUrl, sizes: "512x512", type: "image/png" },
      );
    } else {
      icons.push(
        { src: generateDefaultIcon(192, settings?.themeColor || "#1f6feb", shortName), sizes: "192x192", type: "image/png" },
        { src: generateDefaultIcon(512, settings?.themeColor || "#1f6feb", shortName), sizes: "512x512", type: "image/png" },
      );
    }

    const manifest = {
      name: appName,
      short_name: shortName,
      description: settings?.description || project?.description || "",
      start_url: settings?.startUrl || "/",
      display: settings?.display || "standalone",
      orientation: settings?.orientation || "any",
      theme_color: settings?.themeColor || "#1f6feb",
      background_color: settings?.backgroundColor || "#ffffff",
      icons,
    };

    res.setHeader("Content-Type", "application/manifest+json");
    res.json(manifest);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to generate manifest" } });
  }
});

router.get("/projects/:projectId/pwa/service-worker", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const [settings] = await db
      .select()
      .from(pwaSettingsTable)
      .where(eq(pwaSettingsTable.projectId, req.params.projectId))
      .limit(1);

    if (!settings?.enabled) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "PWA is not enabled for this project" } });
      return;
    }

    const offlineEnabled = settings?.offlineEnabled ?? true;
    const cacheName = `pwa-cache-${req.params.projectId}-v1`;

    const sw = generateServiceWorker(cacheName, offlineEnabled);

    res.setHeader("Content-Type", "application/javascript");
    res.send(sw);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to generate service worker" } });
  }
});

function generateDefaultIcon(size: number, color: string, text: string): string {
  const letter = text.charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="${color}"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-family="Arial,sans-serif" font-weight="bold" font-size="${size * 0.45}">${letter}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function generateServiceWorker(cacheName: string, offlineEnabled: boolean): string {
  return `
const CACHE_NAME = '${cacheName}';
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  ${offlineEnabled ? `event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {});
    })
  );` : ''}
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  ${offlineEnabled ? `event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match(OFFLINE_URL).then((offline) => {
              return offline || new Response(
                '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui,sans-serif;background:#0e1525;color:#e1e4e8}div{text-align:center}h1{font-size:1.5rem;margin-bottom:0.5rem}p{color:#8b949e}</style></head><body><div><h1>You are offline</h1><p>Please check your internet connection and try again.</p></div></body></html>',
                { headers: { 'Content-Type': 'text/html' } }
              );
            });
          }
          return new Response('', { status: 503 });
        });
      })
  );` : `event.respondWith(fetch(event.request));`}
});
`.trim();
}

function mapPwaSettings(s: typeof pwaSettingsTable.$inferSelect) {
  return {
    projectId: s.projectId,
    enabled: s.enabled,
    appName: s.appName,
    shortName: s.shortName,
    description: s.description,
    themeColor: s.themeColor,
    backgroundColor: s.backgroundColor,
    display: s.display,
    orientation: s.orientation,
    iconUrl: s.iconUrl,
    startUrl: s.startUrl,
    offlineEnabled: s.offlineEnabled,
  };
}

export default router;
