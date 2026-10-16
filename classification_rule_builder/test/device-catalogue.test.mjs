import test from "node:test";
import assert from "node:assert/strict";
import { batteryHealthIncluded, buildDeviceCatalogue, generateDeviceCatalogueJinja, validateDeviceCatalogue } from "../src/device-catalogue.mjs";
import { seedCatalogue } from "../src/rules.mjs";

const device = (overrides = {}) => ({
  id: "device-1",
  name: "Example",
  manufacturer: "Unknown",
  area: "Unassigned",
  entity_names: [],
  entity_ids: [],
  entity_device_classes: [],
  relevant_entity_ids: [],
  camera_evidence: false,
  battery: false,
  battery_entity_id: "",
  battery_ignore: false,
  battery_monitor: false,
  ...overrides,
});

test("automatic membership requires battery evidence", () => {
  const catalogue = seedCatalogue();
  const classification = { source_role: "standalone", battery_health: "automatic" };
  assert.equal(batteryHealthIncluded(catalogue, classification, device()), false);
  assert.equal(batteryHealthIncluded(catalogue, classification, device({ entity_device_classes: ["battery"] })), true);
  assert.equal(batteryHealthIncluded(catalogue, classification, device({ entity_ids: ["sensor.example_battery"] })), true);
});

test("automatic membership uses the editable candidate policy", () => {
  const catalogue = seedCatalogue();
  catalogue.dashboard_population.automatic_candidates = {
    match: "all",
    conditions: [
      { field: "manufacturer", operator: "equals", value: "Reolink" },
      { field: "entity_name", operator: "contains", value: "Battery temperature" },
    ],
  };
  const classification = { source_role: "standalone", battery_health: "automatic" };
  assert.equal(batteryHealthIncluded(catalogue, classification, device({ manufacturer: "Reolink", entity_names: ["Battery temperature"] })), true);
  assert.equal(batteryHealthIncluded(catalogue, classification, device({ manufacturer: "Reolink" })), false);
});

test("an include rule can publish a device without a battery entity", () => {
  const catalogue = seedCatalogue();
  catalogue.rules.unshift({
    id: "forced", name: "Forced", enabled: true, match: "all", function: "Test device", reason: "Explicit dashboard membership",
    asset_group: "", source_role: "standalone", battery_health: "include",
    conditions: [{ field: "device_name", operator: "equals", value: "No battery entity" }],
  });
  const built = buildDeviceCatalogue(catalogue, [device({ name: "No battery entity" })]);
  assert.equal(built.devices.length, 1);
  assert.equal(built.devices[0].battery_entity_id, "");
  assert.equal(built.devices[0].function, "Test device");
});

test("exclusions, duplicates and ignore labels are omitted while monitor labels win", () => {
  const catalogue = seedCatalogue();
  const automatic = { source_role: "standalone", battery_health: "automatic" };
  const battery = { entity_device_classes: ["battery"] };
  assert.equal(batteryHealthIncluded(catalogue, { ...automatic, battery_health: "exclude" }, device(battery)), false);
  assert.equal(batteryHealthIncluded(catalogue, { ...automatic, source_role: "duplicate" }, device(battery)), false);
  assert.equal(batteryHealthIncluded(catalogue, automatic, device({ ...battery, battery_ignore: true })), false);
  assert.equal(batteryHealthIncluded(catalogue, { source_role: "duplicate", battery_health: "exclude" }, device({ battery_monitor: true })), true);
});

test("generated catalogue Jinja preserves offline devices and stable registry identifiers", () => {
  const catalogue = buildDeviceCatalogue(seedCatalogue(), [device({
    entity_device_classes: ["battery"],
    battery_entity_id: "sensor.example_battery",
    entity_ids: ["sensor.example_battery", "binary_sensor.example_motion"],
    relevant_entity_ids: ["sensor.example_battery", "binary_sensor.example_motion"],
  })]);
  assert.deepEqual(validateDeviceCatalogue(catalogue), []);
  const output = generateDeviceCatalogueJinja(catalogue);
  assert.match(output, /macro battery_health_devices\(returns\)/);
  assert.match(output, /device-1/);
  assert.match(output, /sensor\.example_battery/);
  assert.match(output, /Do not edit by hand/);
});
