import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverDevices, reloadCustomTemplates, validateTemplate } from "./home-assistant.mjs";
import { catalogueRevision, classifyDevice, FIELD_DEFINITIONS, generateJinja, OPERATORS, validateCatalogue } from "./rules.mjs";
import { pathsForStatus, pruneBackups, readCatalogue, restoreFiles, saveFiles } from "./storage.mjs";

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const port = Number(process.env.PORT ?? "8099");
const maximumBodyBytes = 1_000_000;

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

async function body(request) {
  let content = "";
  for await (const chunk of request) {
    content += chunk;
    if (Buffer.byteLength(content) > maximumBodyBytes) throw Object.assign(new Error("Request body is too large."), { status: 413 });
  }
  try { return JSON.parse(content || "{}"); } catch { throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 }); }
}

async function serveFile(response, name, type) {
  const content = await readFile(path.join(publicDirectory, name));
  response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  response.end(content);
}

async function handle(request, response) {
  const url = new URL(request.url, "http://classification-rule-builder.local");
  if (request.method === "GET" && (url.pathname === "/" || url.pathname.endsWith("/index.html"))) return serveFile(response, "index.html", "text/html; charset=utf-8");
  if (request.method === "GET" && url.pathname.endsWith("/app.js")) return serveFile(response, "app.js", "text/javascript; charset=utf-8");
  if (request.method === "GET" && url.pathname.endsWith("/styles.css")) return serveFile(response, "styles.css", "text/css; charset=utf-8");
  if (request.method === "GET" && url.pathname.endsWith("/health")) return json(response, 200, { healthy: true });
  if (request.method === "GET" && url.pathname.endsWith("/api/meta")) return json(response, 200, { fields: FIELD_DEFINITIONS, operators: OPERATORS, paths: pathsForStatus() });
  if (request.method === "GET" && url.pathname.endsWith("/api/rules")) return json(response, 200, await readCatalogue());
  if (request.method === "GET" && url.pathname.endsWith("/api/discovery")) {
    const devices = await discoverDevices();
    return json(response, 200, { devices });
  }
  if (request.method === "POST" && url.pathname.endsWith("/api/validate")) {
    const payload = await body(request);
    const errors = validateCatalogue(payload.catalogue);
    if (errors.length) return json(response, 422, { valid: false, errors });
    const template = generateJinja(payload.catalogue);
    await validateTemplate(template);
    const devices = Array.isArray(payload.devices) ? payload.devices : [];
    return json(response, 200, {
      valid: true,
      revision: catalogueRevision(payload.catalogue),
      preview: devices.map((device) => ({ device_id: device.id, ...classifyDevice(payload.catalogue, device) })),
    });
  }
  if (request.method === "POST" && url.pathname.endsWith("/api/save")) {
    const payload = await body(request);
    const current = await readCatalogue();
    if (payload.base_revision !== current.revision) return json(response, 409, { error: "Rules changed since this page loaded. Reload before saving." });
    const errors = validateCatalogue(payload.catalogue);
    if (errors.length) return json(response, 422, { error: "Rule validation failed.", errors });
    const template = generateJinja(payload.catalogue);
    await validateTemplate(template);
    const previous = await saveFiles(payload.catalogue, template);
    try {
      await reloadCustomTemplates();
    } catch (error) {
      await restoreFiles(previous);
      try { await reloadCustomTemplates(); } catch {}
      throw new Error(`Home Assistant rejected the published template; the previous files were restored. ${error.message}`);
    }
    await pruneBackups();
    return json(response, 200, { saved: true, revision: catalogueRevision(payload.catalogue), reloaded: true });
  }
  return json(response, 404, { error: "Not found." });
}

const server = http.createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(`[builder] ${error.message}`);
    json(response, error.status ?? 500, { error: error.message });
  });
});

server.listen(port, "0.0.0.0", () => console.log(`[builder] listening on ${port}`));
