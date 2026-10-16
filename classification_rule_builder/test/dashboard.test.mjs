import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BATTERY_HEALTH_DASHBOARD, batteryHealthConfig, findBatteryHealthDashboard, validDashboardPath } from "../src/dashboard.mjs";

test("Battery Health ships Home Assistant-compatible SmartFamilyOps defaults", () => {
  assert.deepEqual(BATTERY_HEALTH_DASHBOARD, {
    title: "Battery Health",
    icon: "mdi:battery-sync",
    url_path: "smartfamilyops-dashboard",
    view_path: "SmartFamilyOps-battery-health",
    show_in_sidebar: true,
    require_admin: false,
    mode: "storage",
  });
  assert.equal(validDashboardPath(BATTERY_HEALTH_DASHBOARD.url_path), true);
  assert.equal(validDashboardPath("smartfamilyops"), false);
});

test("new Battery Health dashboards contain the maintained card", () => {
  const config = batteryHealthConfig("# managed card");
  assert.equal(config.views[0].path, "SmartFamilyOps-battery-health");
  assert.equal(config.views[0].icon, "mdi:battery-sync");
  assert.deepEqual(config.views[0].cards, [{ type: "markdown", content: "# managed card" }]);
});

test("existing canonical dashboard is detected without touching compatibility copies", () => {
  const canonical = { id: "canonical", url_path: "smartfamilyops-dashboard" };
  const dashboards = [{ id: "old", url_path: "battery-health" }, canonical];
  assert.equal(findBatteryHealthDashboard(dashboards), canonical);
});

test("Dashboard Builder exposes explicit provisioning and the shipped defaults", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(html, /id="provision-dashboard"/);
  assert.match(html, /mdi:battery-sync/);
  assert.match(html, /smartfamilyops-dashboard\/SmartFamilyOps-battery-health/);
  assert.match(script, /api\("dashboard\/provision"/);
});
