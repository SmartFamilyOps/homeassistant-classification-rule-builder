import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const DASHBOARD_SCHEMA_VERSION = 1;
export const DASHBOARD_OWNER = "SmartFamilyOps Discovery Dashboard Builder";
export const LIST_COLUMN_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "online", label: "Online" }),
  Object.freeze({ key: "device", label: "Device" }),
  Object.freeze({ key: "location", label: "Location" }),
  Object.freeze({ key: "manufacturer", label: "Manufacturer" }),
  Object.freeze({ key: "function", label: "Function" }),
  Object.freeze({ key: "asset_group", label: "Logical asset" }),
  Object.freeze({ key: "entities", label: "Entities" }),
]);
export const DEFAULT_LIST_COLUMNS = Object.freeze(["online", "device", "location", "manufacturer", "function"]);
const root = process.env.CONFIG_ROOT ?? "/config";
const definitionsDirectory = path.join(root, "smartfamilyops", "dashboard-builder", "dashboards");

export function dashboardSlug(value) {
  return String(value ?? "dashboard").toLocaleLowerCase("en-GB").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dashboard";
}

function listColumns(value, fallback = DEFAULT_LIST_COLUMNS) {
  const allowed = new Set(LIST_COLUMN_DEFINITIONS.map((column) => column.key));
  const columns = Array.isArray(value) ? value.filter((column) => allowed.has(column)) : fallback;
  return [...new Set(columns)].length ? [...new Set(columns)] : [...fallback];
}

export function newDashboardDefinition(source, input, existingPaths = []) {
  const id = randomUUID();
  const title = String(input.title ?? `Copy of ${source.title}`).trim();
  if (!title) throw Object.assign(new Error("Dashboard name is required."), { status: 422 });
  const slug = dashboardSlug(input.slug || title);
  const base = `smartfamilyops-dashboards-${slug}`;
  let urlPath = base;
  let suffix = 2;
  while (existingPaths.includes(urlPath)) urlPath = `${base}-${suffix++}`;
  return {
    schema_version: DASHBOARD_SCHEMA_VERSION, owner: DASHBOARD_OWNER, id, source_id: source.id,
    title, description: String(input.description ?? `Created from ${source.title}`).trim(),
    icon: String(input.icon ?? source.icon ?? "mdi:view-dashboard-outline").trim(),
    columns: listColumns(input.columns, source.columns ?? DEFAULT_LIST_COLUMNS),
    population_policy: structuredClone(input.population_policy ?? source.population_policy),
    url_path: urlPath, view_path: slug, show_in_sidebar: Boolean(input.show_in_sidebar),
    require_admin: input.require_admin !== false, status: "draft",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

export function newFreshDashboardDefinition(input, populationPolicy, existingPaths = []) {
  const id = randomUUID();
  const title = String(input.title ?? "New SmartFamilyOps dashboard").trim();
  if (!title) throw Object.assign(new Error("Dashboard name is required."), { status: 422 });
  const slug = dashboardSlug(input.slug || title);
  const base = `smartfamilyops-dashboards-${slug}`;
  let urlPath = base;
  let suffix = 2;
  while (existingPaths.includes(urlPath)) urlPath = `${base}-${suffix++}`;
  return {
    schema_version: DASHBOARD_SCHEMA_VERSION, owner: DASHBOARD_OWNER, id, source_id: null,
    title, description: String(input.description ?? "SmartFamilyOps discovery list.").trim(),
    icon: String(input.icon ?? "mdi:view-dashboard-outline").trim(),
    columns: listColumns(input.columns),
    population_policy: structuredClone(populationPolicy),
    url_path: urlPath, view_path: slug, show_in_sidebar: Boolean(input.show_in_sidebar),
    require_admin: input.require_admin !== false, status: "draft",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

export function cloneDashboardConfig(sourceConfig, definition) {
  const config = structuredClone(sourceConfig);
  const view = config.views?.[0];
  if (!view) throw Object.assign(new Error("The source dashboard has no compatible view to copy."), { status: 422 });
  view.title = definition.title;
  view.path = definition.view_path;
  view.icon = definition.icon;
  config.smartfamilyops_dashboard = { schema_version: DASHBOARD_SCHEMA_VERSION, owner: DASHBOARD_OWNER, definition_id: definition.id };
  return config;
}

export function isCompatibleDashboardConfig(config, definitionId) {
  const marker = config?.smartfamilyops_dashboard;
  return marker?.owner === DASHBOARD_OWNER && marker?.schema_version === DASHBOARD_SCHEMA_VERSION
    && (!definitionId || marker.definition_id === definitionId);
}

async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.new`;
  await writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

export async function saveDashboardDefinition(definition) {
  const { dashboard: _dashboard, url: _url, ...persistent } = definition;
  await atomicWrite(path.join(definitionsDirectory, `${persistent.id}.json`), `${JSON.stringify(persistent, null, 2)}\n`);
  return persistent;
}

async function readOptional(file) {
  try { return await readFile(file, "utf8"); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveDashboardDefinitionSet(definitions) {
  const previous = new Map();
  try {
    for (const definition of definitions) {
      const file = path.join(definitionsDirectory, `${definition.id}.json`);
      previous.set(file, await readOptional(file));
      await saveDashboardDefinition(definition);
    }
  } catch (error) {
    await restoreDashboardDefinitionSet(previous);
    throw error;
  }
  return previous;
}

export async function restoreDashboardDefinitionSet(previous) {
  for (const [file, content] of previous.entries()) {
    if (content === null) await rm(file, { force: true });
    else await atomicWrite(file, content);
  }
}

export async function readDashboardDefinitions() {
  try {
    const names = (await readdir(definitionsDirectory)).filter((name) => name.endsWith(".json"));
    const definitions = [];
    for (const name of names) definitions.push(JSON.parse(await readFile(path.join(definitionsDirectory, name), "utf8")));
    return definitions;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export function batteryHealthDefinition(dashboard, populationPolicy) {
  return {
    schema_version: DASHBOARD_SCHEMA_VERSION, owner: DASHBOARD_OWNER, id: "battery-health", source_id: null,
    title: dashboard.title, description: "SmartFamilyOps battery and power discovery dashboard.",
    icon: dashboard.icon || "mdi:battery-sync", url_path: dashboard.url_path, view_path: "battery-health",
    columns: [...DEFAULT_LIST_COLUMNS],
    population_policy: structuredClone(populationPolicy),
    show_in_sidebar: dashboard.show_in_sidebar, require_admin: dashboard.require_admin, status: "published",
    created_at: null, updated_at: new Date().toISOString(),
  };
}
