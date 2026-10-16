export const BATTERY_HEALTH_DASHBOARD = Object.freeze({
  title: "Battery Health",
  icon: "mdi:battery-sync",
  url_path: "smartfamilyops-dashboards",
  view_path: "battery-health",
  show_in_sidebar: true,
  require_admin: false,
  mode: "storage",
});

export const LEGACY_BATTERY_HEALTH_DASHBOARDS = Object.freeze([
  Object.freeze({ url_path: "smartfamilyops-dashboard", view_path: "SmartFamilyOps-battery-health" }),
]);

export function validDashboardPath(urlPath) {
  return typeof urlPath === "string"
    && /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(urlPath);
}

export function batteryHealthConfig(content) {
  return {
    smartfamilyops_dashboard: {
      schema_version: 1,
      owner: "SmartFamilyOps Discovery Dashboard Builder",
      definition_id: "battery-health",
    },
    views: [{
      title: BATTERY_HEALTH_DASHBOARD.title,
      path: BATTERY_HEALTH_DASHBOARD.view_path,
      icon: BATTERY_HEALTH_DASHBOARD.icon,
      cards: [{ type: "markdown", content }],
    }],
  };
}

export function retargetManagedDashboardCard(config, definitionId) {
  const updated = structuredClone(config);
  let changed = false;
  let managed = false;
  const selectorPattern = /{% from 'smartfamilyops_device_catalogue\.jinja' import (?:battery_health_devices|dashboard_devices) -%}\r?\n{% set (?:battery_health_devices_fn|dashboard_devices_fn) = (?:battery_health_devices|dashboard_devices) \| as_function -%}\r?\n{% set catalogued_devices = (?:battery_health_devices_fn\(\)|dashboard_devices_fn\('[^']+'\)) -%}/;
  for (const view of (updated.views ?? [])) {
    for (const card of (view.cards ?? [])) {
      if (card.type !== "markdown" || typeof card.content !== "string") continue;
      const isManagedCard = card.content.includes("SmartFamilyOps managed Battery Health card")
        || card.content.includes("smartfamilyops_device_catalogue.jinja");
      if (!isManagedCard) continue;
      const replacement = `{% from 'smartfamilyops_device_catalogue.jinja' import dashboard_devices -%}\n{% set dashboard_devices_fn = dashboard_devices | as_function -%}\n{% set catalogued_devices = dashboard_devices_fn('${definitionId}') -%}`;
      if (!selectorPattern.test(card.content)) continue;
      managed = true;
      const next = card.content.replace(selectorPattern, replacement);
      changed ||= next !== card.content;
      card.content = next;
    }
  }
  if (managed) updated.smartfamilyops_dashboard = { schema_version: 1, owner: "SmartFamilyOps Discovery Dashboard Builder", definition_id: definitionId };
  return { config: updated, changed, managed };
}

export function findBatteryHealthDashboard(dashboards) {
  return dashboards.find((dashboard) => dashboard.url_path === BATTERY_HEALTH_DASHBOARD.url_path) ?? null;
}

export function findLegacyBatteryHealthDashboard(dashboards) {
  return dashboards.find((dashboard) => LEGACY_BATTERY_HEALTH_DASHBOARDS.some((legacy) => legacy.url_path === dashboard.url_path)) ?? null;
}

export function migrateBatteryHealthConfig(config, legacyUrlPath) {
  const migrated = structuredClone(config);
  const legacy = LEGACY_BATTERY_HEALTH_DASHBOARDS.find((candidate) => candidate.url_path === legacyUrlPath);
  if (legacy && Array.isArray(migrated.views)) {
    const view = migrated.views.find((candidate) => candidate.path === legacy.view_path) ?? migrated.views[0];
    if (view) view.path = BATTERY_HEALTH_DASHBOARD.view_path;
  }
  return migrated;
}

export function upgradeManagedBatteryHealthCard(config, content) {
  const upgraded = structuredClone(config);
  let changed = false;
  for (const view of (upgraded.views ?? [])) {
    for (const card of (view.cards ?? [])) {
      if (card.type !== "markdown" || typeof card.content !== "string") continue;
      const isManagedCard = card.content.includes("SmartFamilyOps managed Battery Health card")
        || (card.content.includes("Battery & Power Observability")
          && card.content.includes("smartfamilyops_device_classification.jinja")
          && card.content.includes("for s in states.sensor"))
        || (card.content.includes("Battery & Power Observability")
          && card.content.includes("smartfamilyops_device_catalogue.jinja")
          && (card.content.includes("battery_health_devices") || card.content.includes("dashboard_devices")));
      if (!isManagedCard) continue;
      card.content = content;
      changed = true;
    }
  }
  if (changed) {
    upgraded.smartfamilyops_dashboard = {
      schema_version: 1,
      owner: "SmartFamilyOps Discovery Dashboard Builder",
      definition_id: "battery-health",
    };
  }
  return { config: upgraded, changed };
}
