import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BATTERY_HEALTH_DASHBOARD, batteryHealthConfig, findBatteryHealthDashboard, findLegacyBatteryHealthDashboard, migrateBatteryHealthConfig, upgradeManagedBatteryHealthCard, validDashboardPath } from "../src/dashboard.mjs";

test("Battery Health ships Home Assistant-compatible SmartFamilyOps defaults", () => {
  assert.deepEqual(BATTERY_HEALTH_DASHBOARD, {
    title: "Battery Health",
    icon: "mdi:battery-sync",
    url_path: "smartfamilyops-dashboards",
    view_path: "battery-health",
    show_in_sidebar: true,
    require_admin: false,
    mode: "storage",
  });
  assert.equal(validDashboardPath(BATTERY_HEALTH_DASHBOARD.url_path), true);
  assert.equal(validDashboardPath("smartfamilyops"), false);
});

test("new Battery Health dashboards contain the maintained card", () => {
  const config = batteryHealthConfig("# managed card");
  assert.equal(config.views[0].path, "battery-health");
  assert.equal(config.views[0].icon, "mdi:battery-sync");
  assert.deepEqual(config.views[0].cards, [{ type: "markdown", content: "# managed card" }]);
});

test("existing canonical dashboard is detected without touching compatibility copies", () => {
  const canonical = { id: "canonical", url_path: "smartfamilyops-dashboards" };
  const dashboards = [{ id: "old", url_path: "smartfamilyops-dashboard" }, canonical];
  assert.equal(findBatteryHealthDashboard(dashboards), canonical);
  assert.equal(findLegacyBatteryHealthDashboard(dashboards)?.id, "old");
});

test("legacy dashboard content is copied while only its route-facing view path changes", () => {
  const config = {
    title: "preserved",
    views: [{
      title: "Battery Health",
      path: "SmartFamilyOps-battery-health",
      cards: [{ type: "markdown", content: "custom user card" }],
    }],
  };
  const migrated = migrateBatteryHealthConfig(config, "smartfamilyops-dashboard");
  assert.equal(migrated.views[0].path, "battery-health");
  assert.equal(migrated.views[0].cards[0].content, "custom user card");
  assert.equal(config.views[0].path, "SmartFamilyOps-battery-health", "migration must not mutate the source dashboard config");
});

test("the managed legacy card is upgraded without replacing user cards", () => {
  const legacy = "# 🛡️ SmartFamily Ops\n## Battery & Power Observability\n{% from 'smartfamilyops_device_classification.jinja' import classify_device %}\n{% for s in states.sensor %}";
  const config = { views: [{ path: "battery-health", cards: [
    { type: "markdown", content: legacy },
    { type: "entities", entities: ["sensor.example"] },
  ] }] };
  const result = upgradeManagedBatteryHealthCard(config, "new managed card");
  assert.equal(result.changed, true);
  assert.equal(result.config.views[0].cards[0].content, "new managed card");
  assert.deepEqual(result.config.views[0].cards[1], config.views[0].cards[1]);
  assert.equal(config.views[0].cards[0].content, legacy, "upgrade must not mutate the loaded configuration");
});

test("the published device-catalogue card is recognised on later app upgrades", () => {
  const previousManagedCard = "## Battery & Power Observability\n{% from 'smartfamilyops_device_catalogue.jinja' import battery_health_devices %}\n{% set catalogued_devices = battery_health_devices(returns) %}";
  const config = { views: [{ cards: [{ type: "markdown", content: previousManagedCard }] }] };
  const result = upgradeManagedBatteryHealthCard(config, "new managed card");
  assert.equal(result.changed, true);
  assert.equal(result.config.views[0].cards[0].content, "new managed card");
});

test("unrecognised custom markdown is preserved", () => {
  const config = { views: [{ cards: [{ type: "markdown", content: "custom user card" }] }] };
  const result = upgradeManagedBatteryHealthCard(config, "new managed card");
  assert.equal(result.changed, false);
  assert.equal(result.config.views[0].cards[0].content, "custom user card");
});

test("Dashboard Builder exposes explicit provisioning and the shipped defaults", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(html, /id="provision-dashboard"/);
  assert.match(html, /mdi:battery-sync/);
  assert.match(html, /smartfamilyops-dashboards\/battery-health/);
  assert.match(script, /api\("dashboard\/provision"/);
});
