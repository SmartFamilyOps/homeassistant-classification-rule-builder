import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summariseAppInfo, summariseDeviceEntities } from "../src/home-assistant.mjs";

test("app info summary reports installed and latest versions with a management path", () => {
  assert.deepEqual(summariseAppInfo({
    slug: "local_classification_rule_builder",
    version: "0.3.0",
    version_latest: "0.3.1",
    update_available: true,
    state: "started",
  }), {
    installed_version: "0.3.0",
    latest_version: "0.3.1",
    update_available: true,
    state: "started",
    management_path: "/config/app/local_classification_rule_builder/info",
  });
});

test("device entity summary counts enabled entities and requires one available state for online", () => {
  const entities = [
    { entity_id: "sensor.example_battery", disabled_by: null },
    { entity_id: "sensor.example_temperature", disabled_by: null },
    { entity_id: "sensor.example_diagnostic", disabled_by: "integration" },
  ];
  const states = new Map([
    ["sensor.example_battery", { state: "unavailable" }],
    ["sensor.example_temperature", { state: "21" }],
  ]);
  assert.deepEqual(summariseDeviceEntities(entities, states), {
    enabled_entity_count: 2,
    disabled_entity_count: 1,
    online: true,
  });
  states.set("sensor.example_temperature", { state: "unknown" });
  assert.equal(summariseDeviceEntities(entities, states).online, false);
});

test("the app exposes refresh, update-check and interface-reload controls", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(html, /id="discover"[^>]*>Refresh Home Assistant data</);
  assert.match(html, /id="check-updates"[^>]*>Check for app updates</);
  assert.match(html, /id="reload-app"[^>]*>Reload app interface</);
  assert.match(script, /api\("app-update-check"/);
  assert.match(script, /window\.location\.reload\(\)/);
});
