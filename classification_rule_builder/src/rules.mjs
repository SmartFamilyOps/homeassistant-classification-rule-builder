import { createHash, randomUUID } from "node:crypto";

export const FIELD_DEFINITIONS = Object.freeze({
  manufacturer: { label: "Manufacturer", type: "text" },
  device_name: { label: "Device name", type: "text" },
  area: { label: "Location / area", type: "text" },
  entity_name: { label: "Entity name", type: "collection" },
  entity_id: { label: "Entity ID", type: "collection" },
  entity_device_class: { label: "Entity device class", type: "collection" },
  camera_evidence: { label: "Camera-specific evidence", type: "boolean" },
});

export const OPERATORS = Object.freeze({
  text: ["equals", "contains", "starts_with", "ends_with"],
  collection: ["equals", "contains"],
  boolean: ["is"],
});

const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLocaleLowerCase("en-GB");

export const DEFAULT_AUTOMATIC_CANDIDATE_POLICY = Object.freeze({
  match: "any",
  conditions: Object.freeze([
    Object.freeze({ field: "entity_device_class", operator: "equals", value: "battery" }),
    Object.freeze({ field: "entity_id", operator: "contains", value: "battery" }),
  ]),
});

export function automaticCandidatePolicy(catalogue) {
  const configured = catalogue?.dashboard_population?.automatic_candidates;
  return configured ?? DEFAULT_AUTOMATIC_CANDIDATE_POLICY;
}

function seededRule(name, functionName, reason, conditions, match = "all", asset = {}) {
  return {
    // Seed IDs must be stable. The legacy importer rebuilds this catalogue on
    // every read until the first publish, so random IDs would make its revision
    // change between page load and save and falsely trigger the stale-save guard.
    id: `seed-${createHash("sha256").update(name).digest("hex").slice(0, 16)}`,
    name, enabled: true, match, function: functionName, reason, conditions,
    asset_group: asset.asset_group ?? "",
    source_role: asset.source_role ?? "standalone",
    battery_health: asset.battery_health ?? "automatic",
  };
}

export function seedCatalogue() {
  return {
    version: 1,
    fallback: {
      function: "Battery device",
      reason: "Fallback: no recognised function evidence",
      battery_health: "automatic",
    },
    dashboard_population: {
      automatic_candidates: {
        match: DEFAULT_AUTOMATIC_CANDIDATE_POLICY.match,
        conditions: DEFAULT_AUTOMATIC_CANDIDATE_POLICY.conditions.map((condition) => ({ ...condition })),
      },
    },
    rules: [
      seededRule(
        "Mobile phone evidence",
        "Mobile phone",
        "Registered mobile-app entities include SIM or BSSID evidence",
        [
          { field: "entity_name", operator: "contains", value: "SIM 1" },
          { field: "entity_name", operator: "contains", value: "BSSID" },
        ],
        "any",
        { battery_health: "exclude" },
      ),
      seededRule(
        "Apple iPhone runtime fallback",
        "Mobile phone",
        "Apple device name contains iPhone when disabled mobile-app entities are unavailable to dashboard templates",
        [
          { field: "manufacturer", operator: "equals", value: "Apple" },
          { field: "device_name", operator: "contains", value: "iPhone" },
        ],
        "all",
        { battery_health: "exclude" },
      ),
      seededRule(
        "Front Door Lock — SwitchBot Cloud source",
        "Lock / access control",
        "Primary Home Assistant source for the Front Door Lock logical asset",
        [
          { field: "manufacturer", operator: "equals", value: "SwitchBot" },
          { field: "device_name", operator: "equals", value: "Front Door Lock - SwitchBot Cloud" },
        ],
        "all",
        { asset_group: "front-door-lock", source_role: "primary" },
      ),
      seededRule(
        "Front Door Lock — Bluetooth diagnostic source",
        "Lock / access control",
        "Duplicate diagnostic source for the Front Door Lock logical asset",
        [
          { field: "manufacturer", operator: "equals", value: "SwitchBot" },
          { field: "device_name", operator: "equals", value: "Front Door Lock - Bluetooth Diagnostic" },
        ],
        "all",
        { asset_group: "front-door-lock", source_role: "duplicate" },
      ),
      seededRule(
        "IKEA BILRESA scroll wheel",
        "Scroll wheel hand switch",
        "IKEA device with registered entity Current switch position (9)",
        [
          { field: "manufacturer", operator: "equals", value: "IKEA of Sweden" },
          { field: "entity_name", operator: "equals", value: "Current switch position (9)" },
        ],
      ),
      seededRule(
        "IKEA BILRESA dual button",
        "Dual-button hand switch",
        "IKEA device with registered entity pair Current switch position (1) and (2)",
        [
          { field: "manufacturer", operator: "equals", value: "IKEA of Sweden" },
          { field: "entity_name", operator: "equals", value: "Current switch position (1)" },
          { field: "entity_name", operator: "equals", value: "Current switch position (2)" },
        ],
      ),
      seededRule(
        "SwitchBot Keypad Vision Pro",
        "Keypad Vision Pro",
        "SwitchBot device with registered Radar triggered distance entity",
        [
          { field: "manufacturer", operator: "equals", value: "SwitchBot" },
          { field: "entity_name", operator: "equals", value: "Radar triggered distance" },
        ],
      ),
      seededRule(
        "IKEA temperature and humidity sensor",
        "Temperature/humidity sensor",
        "IKEA device with registered Humidity entity",
        [
          { field: "manufacturer", operator: "equals", value: "IKEA of Sweden" },
          { field: "entity_name", operator: "equals", value: "Humidity" },
        ],
      ),
      seededRule(
        "Camera-specific entities",
        "Video camera",
        "Camera-specific entities are registered for the device",
        [{ field: "camera_evidence", operator: "is", value: "true" }],
      ),
      seededRule(
        "Motion detector name",
        "Motion detector",
        "Device name contains motion sensor or motion detector",
        [
          { field: "device_name", operator: "contains", value: "motion sensor" },
          { field: "device_name", operator: "contains", value: "motion detector" },
        ],
        "any",
      ),
      seededRule(
        "Occupancy sensor name",
        "Motion / occupancy sensor",
        "Device name contains occupancy or presence",
        [
          { field: "device_name", operator: "contains", value: "occupancy" },
          { field: "device_name", operator: "contains", value: "presence" },
        ],
        "any",
      ),
      seededRule(
        "Lock name",
        "Lock / access control",
        "Device name contains lock",
        [{ field: "device_name", operator: "contains", value: "lock" }],
      ),
      seededRule(
        "Contact sensor name",
        "Contact sensor",
        "Device name contains contact, door or window",
        [
          { field: "device_name", operator: "contains", value: "contact" },
          { field: "device_name", operator: "contains", value: "door" },
          { field: "device_name", operator: "contains", value: "window" },
        ],
        "any",
      ),
    ],
  };
}

export function importLegacyCatalogue(template) {
  const requiredEvidence = [
    "macro classify_device(device, returns)",
    "device.has_switch_position_1",
    "device.has_switch_position_2",
    "device.has_switch_position_9",
    "device.has_humidity",
    "device.has_radar_triggered_distance",
    "device.camera",
    "'motion sensor' in device.label",
    "'occupancy' in device.label",
    "'lock' in device.label",
    "'contact' in device.label",
  ];
  const missing = requiredEvidence.filter((evidence) => !template.includes(evidence));
  const branchCount = (template.match(/{%-\s*(?:if|elif)\b/g) ?? []).length;
  if (missing.length || branchCount !== 9) {
    return {
      recognised: false,
      reason: missing.length
        ? `The existing classifier contains unsupported or missing evidence: ${missing.join(", ")}.`
        : `Expected 9 classifier branches but found ${branchCount}.`,
    };
  }
  return {
    recognised: true,
    catalogue: seedCatalogue(),
    branch_count: branchCount,
    message: "Imported the recognised SmartFamilyOps Jinja catalogue and added explicit logical-asset source rules.",
  };
}

function validateCondition(condition, path, errors) {
  if (!condition || typeof condition !== "object") {
    errors.push(`${path} must be an object.`);
    return;
  }
  const definition = FIELD_DEFINITIONS[condition.field];
  if (!definition) errors.push(`${path}.field is not supported.`);
  else if (!OPERATORS[definition.type].includes(condition.operator)) {
    errors.push(`${path}.operator is not valid for ${definition.label}.`);
  }
  if (!text(condition.value)) errors.push(`${path}.value is required.`);
  if (definition?.type === "boolean" && !["true", "false"].includes(lower(condition.value))) {
    errors.push(`${path}.value must be true or false.`);
  }
}

export function validateAutomaticCandidatePolicy(policy, path = "population_policy") {
  const errors = [];
  if (!policy || typeof policy !== "object") return [`${path} must be an object.`];
  if (!["all", "any"].includes(policy.match)) errors.push(`${path}.match must be all or any.`);
  if (!Array.isArray(policy.conditions) || policy.conditions.length === 0) {
    errors.push(`${path}.conditions must contain at least one condition.`);
  } else {
    policy.conditions.forEach((condition, index) => validateCondition(condition, `${path}.conditions[${index}]`, errors));
  }
  return errors;
}

export function validateCatalogue(candidate) {
  const errors = [];
  if (!candidate || typeof candidate !== "object") return ["Catalogue must be an object."];
  if (candidate.version !== 1) errors.push("version must be 1.");
  if (!Array.isArray(candidate.rules)) errors.push("rules must be an array.");
  if (!text(candidate.fallback?.function)) errors.push("fallback.function is required.");
  if (!text(candidate.fallback?.reason)) errors.push("fallback.reason is required.");

  const policy = automaticCandidatePolicy(candidate);
  errors.push(...validateAutomaticCandidatePolicy(policy, "dashboard_population.automatic_candidates"));

  const ids = new Set();
  const names = new Set();
  for (const [index, rule] of (candidate.rules ?? []).entries()) {
    const path = `rules[${index}]`;
    if (!rule || typeof rule !== "object") {
      errors.push(`${path} must be an object.`);
      continue;
    }
    if (!text(rule.id)) errors.push(`${path}.id is required.`);
    else if (ids.has(rule.id)) errors.push(`${path}.id must be unique.`);
    else ids.add(rule.id);
    if (!text(rule.name)) errors.push(`${path}.name is required.`);
    else if (names.has(lower(rule.name))) errors.push(`${path}.name must be unique.`);
    else names.add(lower(rule.name));
    if (typeof rule.enabled !== "boolean") errors.push(`${path}.enabled must be true or false.`);
    if (!["all", "any"].includes(rule.match)) errors.push(`${path}.match must be all or any.`);
    if (!text(rule.function)) errors.push(`${path}.function is required.`);
    if (!text(rule.reason)) errors.push(`${path}.reason is required.`);
    if (!['standalone', 'primary', 'duplicate'].includes(rule.source_role ?? 'standalone')) {
      errors.push(`${path}.source_role must be standalone, primary or duplicate.`);
    }
    if (!['automatic', 'include', 'exclude'].includes(rule.battery_health ?? 'automatic')) {
      errors.push(`${path}.battery_health must be automatic, include or exclude.`);
    }
    if ((rule.source_role === 'primary' || rule.source_role === 'duplicate') && !text(rule.asset_group)) {
      errors.push(`${path}.asset_group is required for primary and duplicate sources.`);
    }
    if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
      errors.push(`${path}.conditions must contain at least one condition.`);
    } else {
      rule.conditions.forEach((condition, conditionIndex) =>
        validateCondition(condition, `${path}.conditions[${conditionIndex}]`, errors),
      );
    }
  }
  return errors;
}

function compareScalar(source, operator, expected) {
  const value = lower(source);
  const wanted = lower(expected);
  if (operator === "equals") return value === wanted;
  if (operator === "contains") return value.includes(wanted);
  if (operator === "starts_with") return value.startsWith(wanted);
  if (operator === "ends_with") return value.endsWith(wanted);
  return false;
}

export function conditionMatches(condition, device) {
  if (condition.field === "camera_evidence") {
    return Boolean(device.camera_evidence) === (lower(condition.value) === "true");
  }
  const source = {
    manufacturer: device.manufacturer,
    device_name: device.name,
    area: device.area,
  }[condition.field];
  if (source !== undefined) return compareScalar(source, condition.operator, condition.value);

  const collection = {
    entity_name: device.entity_names,
    entity_id: device.entity_ids,
    entity_device_class: device.entity_device_classes,
  }[condition.field];
  return (collection ?? []).some((value) => compareScalar(value, condition.operator, condition.value));
}

export function automaticCandidateMatches(catalogue, device) {
  const policy = automaticCandidatePolicy(catalogue);
  const matches = policy.conditions.map((condition) => conditionMatches(condition, device));
  return policy.match === "all" ? matches.every(Boolean) : matches.some(Boolean);
}

export function classifyDevice(catalogue, device) {
  for (const rule of catalogue.rules) {
    if (!rule.enabled) continue;
    const results = rule.conditions.map((condition) => conditionMatches(condition, device));
    const matched = rule.match === "all" ? results.every(Boolean) : results.some(Boolean);
    if (matched) {
      return {
        function: rule.function,
        reason: rule.reason,
        asset_group: text(rule.asset_group),
        source_role: rule.source_role ?? "standalone",
        battery_health: rule.battery_health ?? "automatic",
        rule_id: rule.id,
        rule_name: rule.name,
      };
    }
  }
  return {
    ...catalogue.fallback,
    asset_group: "",
    source_role: "standalone",
    battery_health: catalogue.fallback.battery_health ?? "automatic",
    rule_id: null,
    rule_name: "Fallback",
  };
}

function jinjaString(value) {
  return JSON.stringify(text(value)).replaceAll("<", "\\u003c");
}

function jinjaScalar(source, operator, value) {
  const expected = jinjaString(lower(value));
  if (operator === "equals") return `${source} == ${expected}`;
  if (operator === "contains") return `${expected} in ${source}`;
  if (operator === "starts_with") return `${source}.startswith(${expected})`;
  return `${source}.endswith(${expected})`;
}

function jinjaCondition(condition) {
  if (condition.field === "camera_evidence") {
    return `(device.camera_evidence | default(device.camera | default(false))) == ${lower(condition.value)}`;
  }
  const scalars = {
    manufacturer: "(device.manufacturer | default('') | lower)",
    device_name: "(device.name | default(device.label | default('')) | lower)",
    area: "(device.area | default('') | lower)",
  };
  if (scalars[condition.field]) return jinjaScalar(scalars[condition.field], condition.operator, condition.value);

  const collections = {
    entity_name: "device.entity_names",
    entity_id: "device.entity_ids",
    entity_device_class: "device.entity_device_classes",
  };
  const collection = collections[condition.field];
  const expected = jinjaString(lower(condition.value));
  if (condition.operator === "equals") {
    if (condition.field === "entity_name") {
      let compatibilityKey = lower(condition.value).replace(/^current switch position\s*/, "switch position ");
      compatibilityKey = `has_${compatibilityKey.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
      return `(${expected} in (${collection} | default([])) or device.${compatibilityKey} | default(false))`;
    }
    return `${expected} in (${collection} | default([]))`;
  }
  return `${expected} in ((${collection} | default([])) | join(' | ') | lower)`;
}

export function generateJinja(catalogue) {
  const errors = validateCatalogue(catalogue);
  if (errors.length) throw new Error(errors.join("\n"));
  const lines = [
    "{# Generated by SmartFamilyOps Discovery Dashboard Builder. Do not edit by hand. #}",
    "{# Edit the structured catalogue in the Home Assistant app, then publish it. #}",
    "",
    "{% macro classify_device(device, returns) -%}",
  ];

  let emitted = 0;
  for (const rule of catalogue.rules) {
    if (!rule.enabled) continue;
    const keyword = emitted === 0 ? "if" : "elif";
    const joiner = rule.match === "all" ? " and " : " or ";
    const conditions = rule.conditions.map(jinjaCondition).join(joiner);
    lines.push(`  {%- ${keyword} ${conditions} -%}`);
    lines.push("    {% do returns({");
    lines.push(`      'function': ${jinjaString(rule.function)},`);
    lines.push(`      'reason': ${jinjaString(rule.reason)},`);
    lines.push(`      'asset_group': ${jinjaString(rule.asset_group)},`);
    lines.push(`      'source_role': ${jinjaString(rule.source_role ?? "standalone")},`);
    lines.push(`      'battery_health': ${jinjaString(rule.battery_health ?? "automatic")}`);
    lines.push("    }) %}");
    emitted += 1;
  }
  if (emitted) lines.push("  {%- else -%}");
  lines.push("    {% do returns({");
  lines.push(`      'function': ${jinjaString(catalogue.fallback.function)},`);
  lines.push(`      'reason': ${jinjaString(catalogue.fallback.reason)},`);
  lines.push("      'asset_group': '',");
  lines.push("      'source_role': 'standalone',");
  lines.push(`      'battery_health': ${jinjaString(catalogue.fallback.battery_health ?? "automatic")}`);
  lines.push("    }) %}");
  if (emitted) lines.push("  {%- endif -%}");
  lines.push("{%- endmacro %}", "");
  return lines.join("\n");
}

export function catalogueRevision(catalogue) {
  return createHash("sha256").update(JSON.stringify(catalogue)).digest("hex").slice(0, 16);
}

export function newRule() {
  return {
    ...seededRule(
    "New rule",
    "Battery device",
    "Deterministic rule created in SmartFamilyOps Discovery Dashboard Builder",
    [{ field: "manufacturer", operator: "equals", value: "" }],
    ),
    id: randomUUID(),
  };
}
