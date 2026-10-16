import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deviceEntityEvidence, summariseDeviceEntities } from "../src/home-assistant.mjs";

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

test("device evidence chooses an enabled battery entity and retains offline status candidates", () => {
  const entities = [
    { entity_id: "sensor.example_battery_old", disabled_by: "integration", labels: [] },
    { entity_id: "sensor.example_battery", disabled_by: null, labels: ["battery_monitor"] },
    { entity_id: "button.example_restart", disabled_by: null, labels: [] },
    { entity_id: "binary_sensor.example_motion", disabled_by: null, labels: [] },
  ];
  const states = new Map([
    ["sensor.example_battery", { state: "unavailable", attributes: { device_class: "battery" } }],
  ]);
  assert.deepEqual(deviceEntityEvidence(entities, states), {
    battery: true,
    battery_entity_id: "sensor.example_battery",
    battery_ignore: false,
    battery_monitor: true,
    relevant_entity_ids: ["sensor.example_battery", "binary_sensor.example_motion"],
  });
});

test("the app exposes discovery, Apps navigation and interface-reload controls", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(html, /id="discover"[^>]*>Refresh Home Assistant data</);
  assert.match(html, /id="open-apps"[^>]*>Open Home Assistant Apps</);
  assert.match(html, /id="reload-app"[^>]*>Reload app interface</);
  assert.match(script, /window\.top\.location\.assign\("\/config\/apps\/installed"\)/);
  assert.match(script, /window\.location\.reload\(\)/);
  assert.doesNotMatch(html, /Check for app updates/);
  assert.doesNotMatch(script, /app-update-check/);
});

test("Home Assistant presents the product as Dashboard Builder", async () => {
  const config = await readFile(new URL("../config.yaml", import.meta.url), "utf8");
  assert.match(config, /^name: SmartFamilyOps Discovery Dashboard Builder$/m);
  assert.match(config, /^panel_title: Dashboard Builder$/m);
  assert.match(config, /^panel_icon: mdi:view-dashboard-edit$/m);
});

test("summary groups device and entity totals with active and inactive breakdowns", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  for (const id of ["device-count", "online-device-count", "offline-device-count", "entity-count", "enabled-count", "disabled-count"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(script, /enabledEntities \+ disabledEntities/);
});

test("the container includes the maintained Battery Health dashboard source", async () => {
  const dockerfile = await readFile(new URL("../Dockerfile", import.meta.url), "utf8");
  const card = await readFile(new URL("../dashboard/battery-health-card.jinja", import.meta.url), "utf8");
  const example = await readFile(new URL("../../examples/battery-health-dashboard/card.jinja", import.meta.url), "utf8");
  assert.match(dockerfile, /COPY dashboard \/app\/dashboard/);
  assert.match(card, /Battery & Power Observability/);
  assert.match(card, /smartfamilyops_device_catalogue\.jinja/);
  assert.equal(card, example, "the packaged dashboard and documented example must stay identical");
});
