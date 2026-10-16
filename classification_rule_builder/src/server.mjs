import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDashboard, deleteDashboard, discoverDevices, listDashboards, loadDashboardConfig, reloadCustomTemplates, saveDashboardConfig, updateDashboard, validateTemplate } from "./home-assistant.mjs";
import { BATTERY_HEALTH_DASHBOARD, batteryHealthConfig, findBatteryHealthDashboard, findLegacyBatteryHealthDashboard, migrateBatteryHealthConfig, upgradeManagedBatteryHealthCard, validDashboardPath } from "./dashboard.mjs";
import { buildDeviceCatalogue, generateDeviceCatalogueJinja } from "./device-catalogue.mjs";
import { catalogueRevision, classifyDevice, FIELD_DEFINITIONS, generateJinja, OPERATORS, validateCatalogue } from "./rules.mjs";
import { pathsForStatus, pruneBackups, readCatalogue, restoreFiles, saveFiles } from "./storage.mjs";

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const dashboardCardPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dashboard/battery-health-card.jinja");
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

function dashboardMetadata({ creating = false } = {}) {
  const { title, icon, url_path, show_in_sidebar, require_admin } = BATTERY_HEALTH_DASHBOARD;
  return creating
    ? { title, icon, url_path, show_in_sidebar, require_admin }
    : { title, icon, show_in_sidebar, require_admin };
}

async function dashboardStatus() {
  const dashboards = await listDashboards();
  return {
    defaults: BATTERY_HEALTH_DASHBOARD,
    dashboard: findBatteryHealthDashboard(dashboards),
    legacy_dashboard: findLegacyBatteryHealthDashboard(dashboards),
  };
}

async function upgradeDashboardCardIfManaged() {
  const status = await dashboardStatus();
  if (!status.dashboard) return false;
  const existingConfig = await loadDashboardConfig(BATTERY_HEALTH_DASHBOARD.url_path);
  const content = await readFile(dashboardCardPath, "utf8");
  const upgrade = upgradeManagedBatteryHealthCard(existingConfig, content);
  if (upgrade.changed) await saveDashboardConfig(BATTERY_HEALTH_DASHBOARD.url_path, upgrade.config);
  return upgrade.changed;
}

async function migrateLegacyDashboard(legacyDashboard) {
  const existingConfig = await loadDashboardConfig(legacyDashboard.url_path);
  const created = await createDashboard(dashboardMetadata({ creating: true }));
  try {
    await saveDashboardConfig(
      BATTERY_HEALTH_DASHBOARD.url_path,
      migrateBatteryHealthConfig(existingConfig, legacyDashboard.url_path),
    );
  } catch (error) {
    const dashboardId = created?.id ?? findBatteryHealthDashboard(await listDashboards())?.id;
    if (dashboardId) {
      try { await deleteDashboard(dashboardId); } catch {}
    }
    throw new Error(`The legacy dashboard could not be migrated; it remains unchanged. ${error.message}`);
  }
  await deleteDashboard(legacyDashboard.id);
  return { migrated: true, created: true, aligned: true, ...await dashboardStatus() };
}

async function provisionDashboard({ alignExisting = false } = {}) {
  if (!validDashboardPath(BATTERY_HEALTH_DASHBOARD.url_path)) throw new Error("The managed dashboard path is invalid; Home Assistant requires a lowercase path containing a hyphen.");
  const status = await dashboardStatus();
  if (status.dashboard) {
    if (alignExisting) await updateDashboard(status.dashboard.id, dashboardMetadata());
    return { created: false, aligned: alignExisting, ...await dashboardStatus() };
  }
  if (status.legacy_dashboard) return migrateLegacyDashboard(status.legacy_dashboard);
  const created = await createDashboard(dashboardMetadata({ creating: true }));
  try {
    const content = await readFile(dashboardCardPath, "utf8");
    await saveDashboardConfig(BATTERY_HEALTH_DASHBOARD.url_path, batteryHealthConfig(content));
  } catch (error) {
    const dashboardId = created?.id ?? findBatteryHealthDashboard(await listDashboards())?.id;
    if (dashboardId) {
      try { await deleteDashboard(dashboardId); } catch {}
    }
    throw new Error(`Dashboard content could not be installed; the incomplete dashboard was removed. ${error.message}`);
  }
  return { created: true, aligned: true, ...await dashboardStatus() };
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
  if (request.method === "GET" && url.pathname.endsWith("/api/dashboard")) return json(response, 200, await dashboardStatus());
  if (request.method === "POST" && url.pathname.endsWith("/api/dashboard/provision")) {
    return json(response, 200, await provisionDashboard({ alignExisting: true }));
  }
  if (request.method === "POST" && url.pathname.endsWith("/api/validate")) {
    const payload = await body(request);
    const errors = validateCatalogue(payload.catalogue);
    if (errors.length) return json(response, 422, { valid: false, errors });
    const template = generateJinja(payload.catalogue);
    await validateTemplate(template);
    const devices = Array.isArray(payload.devices) ? payload.devices : [];
    const deviceCatalogue = buildDeviceCatalogue(payload.catalogue, devices);
    await validateTemplate(generateDeviceCatalogueJinja(deviceCatalogue));
    return json(response, 200, {
      valid: true,
      revision: catalogueRevision(payload.catalogue),
      device_count: deviceCatalogue.devices.length,
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
    const devices = await discoverDevices();
    const deviceCatalogue = buildDeviceCatalogue(payload.catalogue, devices);
    const deviceTemplate = generateDeviceCatalogueJinja(deviceCatalogue);
    await validateTemplate(deviceTemplate);
    const previous = await saveFiles(payload.catalogue, template, deviceCatalogue, deviceTemplate);
    try {
      await reloadCustomTemplates();
    } catch (error) {
      await restoreFiles(previous);
      try { await reloadCustomTemplates(); } catch {}
      throw new Error(`Home Assistant rejected the published template; the previous files were restored. ${error.message}`);
    }
    let dashboardCardUpgraded = false;
    try {
      dashboardCardUpgraded = await upgradeDashboardCardIfManaged();
    } catch (error) {
      console.error(`[builder] Published catalogues but could not upgrade the managed Battery Health card: ${error.message}`);
    }
    await pruneBackups();
    return json(response, 200, { saved: true, revision: catalogueRevision(payload.catalogue), device_count: deviceCatalogue.devices.length, reloaded: true, dashboard_card_upgraded: dashboardCardUpgraded });
  }
  return json(response, 404, { error: "Not found." });
}

const server = http.createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(`[builder] ${error.message}`);
    json(response, error.status ?? 500, { error: error.message });
  });
});

server.listen(port, "0.0.0.0", async () => {
  console.log(`[builder] listening on ${port}`);
  try {
    const result = await provisionDashboard();
    console.log(`[builder] Battery Health dashboard ${result.created ? "created with SmartFamilyOps defaults" : "already present; existing user settings preserved"}.`);
  } catch (error) {
    console.error(`[builder] Battery Health dashboard provisioning skipped: ${error.message}`);
  }
});
