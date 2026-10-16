import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { automaticCandidateMatches, catalogueRevision, classifyDevice, generateJinja, importLegacyCatalogue, seedCatalogue, validateCatalogue } from "../src/rules.mjs";

const device = (overrides = {}) => ({
  name: "Example", manufacturer: "Unknown", area: "Unassigned",
  entity_names: [], entity_ids: [], entity_device_classes: [], camera_evidence: false, ...overrides,
});

test("automatic candidate defaults are explicit and editable", () => {
  const catalogue = seedCatalogue();
  assert.equal(automaticCandidateMatches(catalogue, device({ entity_device_classes: ["battery"] })), true);
  assert.equal(automaticCandidateMatches(catalogue, device({ entity_ids: ["sensor.example_battery_level"] })), true);
  assert.equal(automaticCandidateMatches(catalogue, device()), false);
  catalogue.dashboard_population.automatic_candidates = {
    match: "all",
    conditions: [
      { field: "manufacturer", operator: "equals", value: "IKEA of Sweden" },
      { field: "entity_name", operator: "contains", value: "Battery" },
    ],
  };
  assert.equal(automaticCandidateMatches(catalogue, device({ manufacturer: "IKEA of Sweden", entity_names: ["Battery"] })), true);
  assert.equal(automaticCandidateMatches(catalogue, device({ manufacturer: "IKEA of Sweden" })), false);
});

test("legacy catalogues without a population policy retain the managed defaults", () => {
  const catalogue = seedCatalogue();
  delete catalogue.dashboard_population;
  assert.deepEqual(validateCatalogue(catalogue), []);
  assert.equal(automaticCandidateMatches(catalogue, device({ entity_device_classes: ["battery"] })), true);
});

test("invalid automatic candidate policy is rejected", () => {
  const catalogue = seedCatalogue();
  catalogue.dashboard_population.automatic_candidates.conditions = [];
  assert.match(validateCatalogue(catalogue).join("\n"), /automatic_candidates\.conditions must contain at least one condition/);
});

test("seeded catalogue classifies the exact IKEA dual-button entity pair", () => {
  const result = classifyDevice(seedCatalogue(), device({
    manufacturer: "IKEA of Sweden",
    entity_names: ["Current switch position (1)", "Current switch position (2)"],
  }));
  assert.equal(result.function, "Dual-button hand switch");
});

test("Front Door Lock sources share one logical asset and identify the duplicate", () => {
  const catalogue = seedCatalogue();
  const cloud = classifyDevice(catalogue, device({
    name: "Front Door Lock - SwitchBot Cloud", manufacturer: "SwitchBot",
  }));
  const bluetooth = classifyDevice(catalogue, device({
    name: "Front Door Lock - Bluetooth Diagnostic", manufacturer: "switchbot",
  }));
  assert.equal(cloud.asset_group, "front-door-lock");
  assert.equal(cloud.source_role, "primary");
  assert.equal(bluetooth.asset_group, "front-door-lock");
  assert.equal(bluetooth.source_role, "duplicate");
});

test("scroll-wheel rule works when only Current switch position (9) is registered", () => {
  const result = classifyDevice(seedCatalogue(), device({
    manufacturer: "IKEA of Sweden",
    entity_names: ["Current switch position (9)"],
  }));
  assert.equal(result.function, "Scroll wheel hand switch");
});

test("scroll-wheel evidence wins when positions 1, 2 and 9 are all registered", () => {
  const result = classifyDevice(seedCatalogue(), device({
    manufacturer: "IKEA of Sweden",
    entity_names: ["Current switch position (1)", "Current switch position (2)", "Current switch position (9)"],
  }));
  assert.equal(result.function, "Scroll wheel hand switch");
});

test("motion detector is not inferred to be a video camera from motion alone", () => {
  const result = classifyDevice(seedCatalogue(), device({ name: "Motion Sensor - Garden" }));
  assert.equal(result.function, "Motion detector");
});

test("camera classification requires camera-specific evidence", () => {
  const result = classifyDevice(seedCatalogue(), device({ name: "Stairs", manufacturer: "Reolink", camera_evidence: true }));
  assert.equal(result.function, "Video camera");
});

test("disabled entity names can satisfy rules because discovery uses the registry", () => {
  const result = classifyDevice(seedCatalogue(), device({
    name: "TIMMERFLOTTE", manufacturer: "IKEA of Sweden", entity_names: ["Humidity"],
  }));
  assert.equal(result.function, "Temperature/humidity sensor");
});

test("mobile entity evidence classifies phones and excludes them from Battery Health", () => {
  const result = classifyDevice(seedCatalogue(), device({
    name: "Aleem's iPhone", manufacturer: "Apple", entity_names: ["SIM 1", "BSSID"],
  }));
  assert.equal(result.function, "Mobile phone");
  assert.equal(result.battery_health, "exclude");
});

test("Apple iPhone runtime evidence provides a dashboard-compatible exclusion", () => {
  const result = classifyDevice(seedCatalogue(), device({
    name: "Zayn’s iPhone", manufacturer: "Apple",
  }));
  assert.equal(result.function, "Mobile phone");
  assert.equal(result.battery_health, "exclude");
  assert.equal(result.rule_name, "Apple iPhone runtime fallback");
});

test("legacy rules default to automatic Battery Health membership", () => {
  const catalogue = seedCatalogue();
  delete catalogue.rules[1].battery_health;
  assert.equal(classifyDevice(catalogue, device({
    name: "Front Door Lock - SwitchBot Cloud", manufacturer: "SwitchBot",
  })).battery_health, "automatic");
});

test("invalid condition is rejected before template generation", () => {
  const catalogue = seedCatalogue();
  catalogue.rules[0].conditions[0].value = "";
  assert.match(validateCatalogue(catalogue).join("\n"), /value is required/);
  assert.throws(() => generateJinja(catalogue), /value is required/);
});

test("generated Jinja contains an ordered macro and explicit fallback", () => {
  const output = generateJinja(seedCatalogue());
  assert.match(output, /macro classify_device\(device, returns\)/);
  assert.match(output, /Current switch position/);
  assert.match(output, /Battery device/);
  assert.match(output, /Do not edit by hand/);
  assert.match(output, /device\.has_switch_position_1/);
  assert.match(output, /device\.has_humidity/);
  assert.match(output, /device\.camera/);
  assert.match(output, /'asset_group': "front-door-lock"/);
  assert.match(output, /'source_role': "duplicate"/);
  assert.match(output, /'battery_health': "exclude"/);
});

const legacyTemplate = `{% macro classify_device(device, returns) -%}
{%- if device.manufacturer | lower == 'ikea of sweden' and device.has_switch_position_1 and device.has_switch_position_2 -%}{%- endif -%}
{%- elif device.has_switch_position_9 -%}{%- endif -%}
{%- elif device.has_humidity -%}{%- endif -%}
{%- elif device.has_radar_triggered_distance -%}{%- endif -%}
{%- elif device.camera -%}{%- endif -%}
{%- elif 'motion sensor' in device.label -%}{%- endif -%}
{%- elif 'occupancy' in device.label -%}{%- endif -%}
{%- elif 'lock' in device.label -%}{%- endif -%}
{%- elif 'contact' in device.label -%}{%- endif -%}
{%- endmacro %}`;

test("recognised legacy SmartFamilyOps Jinja is imported into editable rules", () => {
  const result = importLegacyCatalogue(legacyTemplate);
  assert.equal(result.recognised, true);
  assert.equal(result.branch_count, 9);
  assert.equal(result.catalogue.rules.length, 13);
});

test("legacy imports have a stable revision before first publish", () => {
  const first = importLegacyCatalogue(legacyTemplate);
  const second = importLegacyCatalogue(legacyTemplate);
  assert.equal(catalogueRevision(first.catalogue), catalogueRevision(second.catalogue));
});

test("unknown legacy Jinja is refused instead of silently replaced", () => {
  const result = importLegacyCatalogue("{% macro classify_device(device, returns) %}{% endmacro %}");
  assert.equal(result.recognised, false);
  assert.match(result.reason, /unsupported or missing evidence/);
});

test("Battery Health dashboard consumes the published device catalogue", async () => {
  const card = await readFile(new URL("../../examples/battery-health-dashboard/card.jinja", import.meta.url), "utf8");
  assert.match(card, /from 'smartfamilyops_device_catalogue\.jinja' import dashboard_devices/);
  assert.match(card, /dashboard_devices_fn\('battery-health'\)/);
  assert.match(card, /for d in catalogued_devices/);
  assert.doesNotMatch(card, /for s in states\.sensor/);
  assert.doesNotMatch(card, /classify_device/);
});

test("Battery Health table keeps icon-only status second, battery third and limits hover provenance to registry-backed cells", async () => {
  const card = await readFile(new URL("../../examples/battery-health-dashboard/card.jinja", import.meta.url), "utf8");
  const header = card.match(/namespace\(text='([^']+)'\)/)?.[1] ?? "";
  assert.match(header, /^\| # \| Online \| Battery \| Device \| Location \| Manufacturer \| Function \| Edit Device \| Splunk test \|/);
  assert.doesNotMatch(header, /Current mode/);
  assert.match(card, /ha_status_display = '✅' if p\.available_count > 0 else '❌'/);
  assert.doesNotMatch(card, /ha_status_display = '✅ Online'/);
  assert.doesNotMatch(card, /ha_status_display = '❌ Offline'/);
  assert.match(card, /mdi:battery-10/);
  assert.match(card, /<font color="#2196f3"><ha-icon/);
  assert.match(card, /battery_display = .* if level_valid else ''/);
  assert.match(card, /title="Source entity: ' ~ i\.entity_id/);
  assert.match(card, /Home Assistant area registry value for device:/);
  assert.match(card, /device_name\(d\.device_id\)/);
  assert.match(card, /area_name\(d\.device_id\)/);
  assert.match(card, /device_attr\(d\.device_id, 'manufacturer'\)/);
  assert.match(card, /Home Assistant device registry value for device:/);
  assert.doesNotMatch(card, /title="Calculated content:/);
  assert.match(card, /target="_blank" rel="noopener noreferrer"/);
  assert.match(card, /\/config\/devices\/device\/.*i\.device_id/);
  assert.match(card, /mdi:tools/);
  assert.match(card, /tools_cell = '<a href="' ~ device_url ~ '" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(card, /\*\*Home Assistant status:\*\*|\*\*Interpretation:\*\*/);
});
