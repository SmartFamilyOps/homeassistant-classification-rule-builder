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
    views: [{
      title: BATTERY_HEALTH_DASHBOARD.title,
      path: BATTERY_HEALTH_DASHBOARD.view_path,
      icon: BATTERY_HEALTH_DASHBOARD.icon,
      cards: [{ type: "markdown", content }],
    }],
  };
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
