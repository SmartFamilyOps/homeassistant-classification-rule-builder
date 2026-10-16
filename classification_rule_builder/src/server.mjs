import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDashboard, deleteDashboard, discoverDevices, listDashboards, loadDashboardConfig, reloadCustomTemplates, saveDashboardConfig, updateDashboard, validateTemplate } from "./home-assistant.mjs";
import { BATTERY_HEALTH_DASHBOARD, batteryHealthConfig, findBatteryHealthDashboard, findLegacyBatteryHealthDashboard, migrateBatteryHealthConfig, retargetManagedDashboardCard, upgradeManagedBatteryHealthCard, validDashboardPath } from "./dashboard.mjs";
import { batteryHealthDefinition, cloneDashboardConfig, isCompatibleDashboardConfig, newDashboardDefinition, readDashboardDefinitions, restoreDashboardDefinitionSet, saveDashboardDefinition, saveDashboardDefinitionSet } from "./dashboard-definitions.mjs";
import { buildDashboardDeviceCatalogues, generateDashboardDeviceCataloguesJinja } from "./device-catalogue.mjs";
import { automaticCandidatePolicy, catalogueRevision, classifyDevice, FIELD_DEFINITIONS, generateJinja, OPERATORS, validateAutomaticCandidatePolicy, validateCatalogue } from "./rules.mjs";
import { pathsForStatus, pruneBackups, publicationRequired, readCatalogue, restoreFiles, saveFiles } from "./storage.mjs";

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

async function compatibleDashboardDefinitions() {
  const dashboards = await listDashboards();
  const canonical = findBatteryHealthDashboard(dashboards);
  const { catalogue } = await readCatalogue();
  const defaultPolicy = structuredClone(automaticCandidatePolicy(catalogue));
  const stored = (await readDashboardDefinitions()).map((definition) => ({
    ...definition,
    population_policy: structuredClone(definition.population_policy ?? defaultPolicy),
  }));
  const definitions = new Map(stored.map((definition) => [definition.id, definition]));
  if (canonical && !definitions.has("battery-health")) definitions.set("battery-health", batteryHealthDefinition(canonical, defaultPolicy));
  return [...definitions.values()].filter((definition) => dashboards.some((dashboard) => dashboard.url_path === definition.url_path))
    .map((definition) => ({ ...definition, dashboard: dashboards.find((dashboard) => dashboard.url_path === definition.url_path), url: `/${definition.url_path}/${definition.view_path}` }));
}

function applyDashboardPolicies(definitions, policies = []) {
  const byId = new Map(policies.map((entry) => [entry.id, entry.population_policy]));
  return definitions.map((definition) => ({
    ...definition,
    population_policy: structuredClone(byId.get(definition.id) ?? definition.population_policy),
    updated_at: byId.has(definition.id) ? new Date().toISOString() : definition.updated_at,
  }));
}

function dashboardPolicyErrors(definitions) {
  return definitions.flatMap((definition) =>
    validateAutomaticCandidatePolicy(definition.population_policy, `dashboards[${definition.id}].population_policy`),
  );
}

async function saveAsDashboard(payload) {
  const definitions = await compatibleDashboardDefinitions();
  const source = definitions.find((definition) => definition.id === payload.source_id);
  if (!source) throw Object.assign(new Error("Select a compatible source dashboard."), { status: 404 });
  const dashboards = await listDashboards();
  const sourceConfig = await loadDashboardConfig(source.url_path);
  if (source.id !== "battery-health" && !isCompatibleDashboardConfig(sourceConfig, source.id)) {
    throw Object.assign(new Error("The source dashboard no longer carries the SmartFamilyOps compatibility marker."), { status: 409 });
  }
  const definition = newDashboardDefinition(source, payload, dashboards.map((dashboard) => dashboard.url_path));
  const cloned = cloneDashboardConfig(sourceConfig, definition);
  const config = retargetManagedDashboardCard(cloned, definition.id).config;
  const created = await createDashboard({
    title: definition.title, icon: definition.icon, url_path: definition.url_path,
    show_in_sidebar: definition.show_in_sidebar, require_admin: definition.require_admin,
  });
  try {
    await saveDashboardConfig(definition.url_path, config);
    await saveDashboardDefinition(definition);
  } catch (error) {
    const dashboardId = created?.id ?? (await listDashboards()).find((dashboard) => dashboard.url_path === definition.url_path)?.id;
    if (dashboardId) try { await deleteDashboard(dashboardId); } catch {}
    throw new Error(`The draft could not be created; its incomplete Home Assistant dashboard was removed. ${error.message}`);
  }
  return { created: true, definition: { ...definition, url: `/${definition.url_path}/${definition.view_path}` } };
}

async function saveDashboardChanges(payload) {
  const definitions = await compatibleDashboardDefinitions();
  const current = definitions.find((definition) => definition.id === payload.id);
  if (!current) throw Object.assign(new Error("The compatible dashboard was not found."), { status: 404 });
  const dashboard = current.dashboard;
  const updated = {
    ...current,
    title: String(payload.title ?? current.title).trim(),
    description: String(payload.description ?? current.description).trim(),
    icon: String(payload.icon ?? current.icon).trim(),
    show_in_sidebar: Boolean(payload.show_in_sidebar),
    require_admin: Boolean(payload.require_admin),
    updated_at: new Date().toISOString(),
  };
  if (!updated.title) throw Object.assign(new Error("Dashboard name is required."), { status: 422 });
  const originalConfig = await loadDashboardConfig(current.url_path);
  const config = structuredClone(originalConfig);
  const view = config.views?.find((candidate) => candidate.path === current.view_path) ?? config.views?.[0];
  if (!view) throw Object.assign(new Error("The dashboard has no editable view."), { status: 422 });
  view.title = updated.title;
  view.icon = updated.icon;
  config.smartfamilyops_dashboard = { schema_version: 1, owner: "SmartFamilyOps Discovery Dashboard Builder", definition_id: updated.id };
  await updateDashboard(dashboard.id, { title: updated.title, icon: updated.icon, show_in_sidebar: updated.show_in_sidebar, require_admin: updated.require_admin });
  try {
    await saveDashboardConfig(updated.url_path, config);
    await saveDashboardDefinition(updated);
  } catch (error) {
    try { await saveDashboardConfig(current.url_path, originalConfig); } catch {}
    try { await updateDashboard(dashboard.id, { title: current.title, icon: current.icon, show_in_sidebar: current.show_in_sidebar, require_admin: current.require_admin }); } catch {}
    throw new Error(`Dashboard changes were rolled back. ${error.message}`);
  }
  return { saved: true, definition: { ...updated, url: `/${updated.url_path}/${updated.view_path}` } };
}

async function handle(request, response) {
  const url = new URL(request.url, "http://classification-rule-builder.local");
  if (request.method === "GET" && (url.pathname === "/" || url.pathname.endsWith("/index.html"))) return serveFile(response, "index.html", "text/html; charset=utf-8");
  if (request.method === "GET" && url.pathname.endsWith("/app.js")) return serveFile(response, "app.js", "text/javascript; charset=utf-8");
  if (request.method === "GET" && url.pathname.endsWith("/styles.css")) return serveFile(response, "styles.css", "text/css; charset=utf-8");
  if (request.method === "GET" && url.pathname.endsWith("/health")) return json(response, 200, { healthy: true });
  if (request.method === "GET" && url.pathname.endsWith("/api/meta")) return json(response, 200, { fields: FIELD_DEFINITIONS, operators: OPERATORS, paths: pathsForStatus() });
  if (request.method === "GET" && url.pathname.endsWith("/api/rules")) {
    return json(response, 200, { ...await readCatalogue(), publication_required: await publicationRequired() });
  }
  if (request.method === "GET" && url.pathname.endsWith("/api/discovery")) {
    const devices = await discoverDevices();
    return json(response, 200, { devices });
  }
  if (request.method === "GET" && url.pathname.endsWith("/api/dashboard")) return json(response, 200, await dashboardStatus());
  if (request.method === "GET" && url.pathname.endsWith("/api/dashboards")) return json(response, 200, { dashboards: await compatibleDashboardDefinitions() });
  if (request.method === "POST" && url.pathname.endsWith("/api/dashboards/save-as")) return json(response, 201, await saveAsDashboard(await body(request)));
  if (request.method === "POST" && url.pathname.endsWith("/api/dashboards/save")) return json(response, 200, await saveDashboardChanges(await body(request)));
  if (request.method === "POST" && url.pathname.endsWith("/api/dashboard/provision")) {
    return json(response, 200, await provisionDashboard({ alignExisting: true }));
  }
  if (request.method === "POST" && url.pathname.endsWith("/api/validate")) {
    const payload = await body(request);
    const definitions = applyDashboardPolicies(await compatibleDashboardDefinitions(), payload.dashboard_policies);
    const errors = [...validateCatalogue(payload.catalogue), ...dashboardPolicyErrors(definitions)];
    if (errors.length) return json(response, 422, { valid: false, errors });
    const template = generateJinja(payload.catalogue);
    await validateTemplate(template);
    const devices = Array.isArray(payload.devices) ? payload.devices : [];
    const deviceCatalogue = buildDashboardDeviceCatalogues(payload.catalogue, devices, definitions);
    await validateTemplate(generateDashboardDeviceCataloguesJinja(deviceCatalogue));
    return json(response, 200, {
      valid: true,
      revision: catalogueRevision(payload.catalogue),
      device_count: deviceCatalogue.dashboards.reduce((total, dashboard) => total + dashboard.devices.length, 0),
      dashboards: deviceCatalogue.dashboards.map((dashboard) => ({ id: dashboard.dashboard_id, device_count: dashboard.devices.length })),
      preview: devices.map((device) => ({ device_id: device.id, ...classifyDevice(payload.catalogue, device) })),
    });
  }
  if (request.method === "POST" && url.pathname.endsWith("/api/save")) {
    const payload = await body(request);
    const current = await readCatalogue();
    if (payload.base_revision !== current.revision) return json(response, 409, { error: "Rules changed since this page loaded. Reload before saving." });
    const definitions = applyDashboardPolicies(await compatibleDashboardDefinitions(), payload.dashboard_policies);
    const errors = [...validateCatalogue(payload.catalogue), ...dashboardPolicyErrors(definitions)];
    if (errors.length) return json(response, 422, { error: "Rule validation failed.", errors });
    const template = generateJinja(payload.catalogue);
    await validateTemplate(template);
    const devices = await discoverDevices();
    const deviceCatalogue = buildDashboardDeviceCatalogues(payload.catalogue, devices, definitions);
    const deviceTemplate = generateDashboardDeviceCataloguesJinja(deviceCatalogue);
    await validateTemplate(deviceTemplate);
    const dashboardConfigs = [];
    for (const definition of definitions) {
      const original = await loadDashboardConfig(definition.url_path);
      const retargeted = retargetManagedDashboardCard(original, definition.id);
      if (!retargeted.managed) {
        throw Object.assign(new Error(`Dashboard “${definition.title}” no longer contains a managed SmartFamilyOps discovery card.`), { status: 409 });
      }
      dashboardConfigs.push({ definition, original, updated: retargeted.config });
    }
    const previous = await saveFiles(payload.catalogue, template, deviceCatalogue, deviceTemplate);
    let previousDefinitions = new Map();
    try {
      previousDefinitions = await saveDashboardDefinitionSet(definitions);
      for (const dashboard of dashboardConfigs) await saveDashboardConfig(dashboard.definition.url_path, dashboard.updated);
      await reloadCustomTemplates();
    } catch (error) {
      await restoreFiles(previous);
      await restoreDashboardDefinitionSet(previousDefinitions);
      for (const dashboard of dashboardConfigs) {
        try { await saveDashboardConfig(dashboard.definition.url_path, dashboard.original); } catch {}
      }
      try { await reloadCustomTemplates(); } catch {}
      throw new Error(`Home Assistant rejected the published template; the previous files were restored. ${error.message}`);
    }
    const dashboardCardUpgraded = dashboardConfigs.length > 0;
    await pruneBackups();
    return json(response, 200, {
      saved: true,
      revision: catalogueRevision(payload.catalogue),
      device_count: deviceCatalogue.dashboards.reduce((total, dashboard) => total + dashboard.devices.length, 0),
      dashboards: deviceCatalogue.dashboards.map((dashboard) => ({ id: dashboard.dashboard_id, device_count: dashboard.devices.length })),
      reloaded: true,
      dashboard_card_upgraded: dashboardCardUpgraded,
    });
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
    if (!await publicationRequired()) {
      const upgraded = await upgradeDashboardCardIfManaged();
      if (upgraded) console.log("[builder] Managed Battery Health card upgraded to the installed app version.");
    }
  } catch (error) {
    console.error(`[builder] Battery Health dashboard provisioning skipped: ${error.message}`);
  }
});
