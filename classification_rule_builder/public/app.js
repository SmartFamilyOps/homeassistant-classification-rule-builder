const state = {
  catalogue: null,
  baseline: null,
  revision: null,
  meta: null,
  devices: [],
  selected: null,
  dirty: false,
  previewPage: 1,
};

const PREVIEW_PAGE_SIZE = 20;
const $ = (selector) => document.querySelector(selector);
const clone = (value) => structuredClone(value);
const lower = (value) => String(value ?? "").trim().toLocaleLowerCase("en-GB");

async function api(path, options = {}) {
  const response = await fetch(`api/${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers ?? {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with HTTP ${response.status}.`);
    error.details = payload.errors ?? [];
    throw error;
  }
  return payload;
}

function status(kind, title, detail) {
  $("#status-dot").className = `dot ${kind === "ok" ? "" : kind}`;
  $("#status-title").textContent = title;
  $("#status-detail").textContent = detail;
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

function conditionMatches(condition, device) {
  if (condition.field === "camera_evidence") return Boolean(device.camera_evidence) === (lower(condition.value) === "true");
  const scalar = { manufacturer: device.manufacturer, device_name: device.name, area: device.area }[condition.field];
  if (scalar !== undefined) return compareScalar(scalar, condition.operator, condition.value);
  const values = condition.field === "entity_name" ? device.entity_names : device.entity_ids;
  return (values ?? []).some((value) => compareScalar(value, condition.operator, condition.value));
}

function classify(catalogue, device) {
  for (const rule of catalogue.rules) {
    if (!rule.enabled) continue;
    const matches = rule.conditions.map((condition) => conditionMatches(condition, device));
    if (rule.match === "all" ? matches.every(Boolean) : matches.some(Boolean)) {
      return {
        function: rule.function,
        reason: rule.reason,
        asset_group: rule.asset_group ?? "",
        source_role: rule.source_role ?? "standalone",
        battery_health: rule.battery_health ?? "automatic",
        rule_name: rule.name,
        rule_id: rule.id,
      };
    }
  }
  return { ...catalogue.fallback, asset_group: "", source_role: "standalone", battery_health: catalogue.fallback.battery_health ?? "automatic", rule_name: "Fallback", rule_id: null };
}

function batteryHealthIncluded(result, device) {
  if (device.battery_monitor) return true;
  if (device.battery_ignore) return false;
  if (result.source_role === "duplicate") return false;
  if (result.battery_health === "include") return true;
  if (result.battery_health === "exclude") return false;
  return Boolean(device.battery);
}

function previewChanged(device) {
  const current = classify(state.catalogue, device);
  const previous = classify(state.baseline, device);
  return current.function !== previous.function
    || batteryHealthIncluded(current, device) !== batteryHealthIncluded(previous, device);
}

function markDirty() {
  state.dirty = true;
  state.previewPage = 1;
  $("#save").disabled = false;
  status("waiting", "Unpublished changes", "Preview the result, then validate and publish when ready.");
  renderSummary();
  renderRules();
  renderPreview();
}

function selectedRule() {
  return state.catalogue?.rules.find((rule) => rule.id === state.selected);
}

function renderSummary() {
  $("#rule-count").textContent = state.catalogue?.rules.length ?? "—";
  $("#dashboard-rule-count").textContent = state.catalogue?.rules.length ?? "—";
  $("#device-count").textContent = state.devices.length || "—";
  $("#online-device-count").textContent = state.devices.length
    ? state.devices.filter((device) => device.online).length
    : "—";
  $("#offline-device-count").textContent = state.devices.length
    ? state.devices.filter((device) => !device.online).length
    : "—";
  const enabledEntities = state.devices.reduce((total, device) => total + device.enabled_entity_count, 0);
  const disabledEntities = state.devices.reduce((total, device) => total + device.disabled_entity_count, 0);
  $("#entity-count").textContent = state.devices.length ? enabledEntities + disabledEntities : "—";
  $("#enabled-count").textContent = state.devices.length ? enabledEntities : "—";
  $("#disabled-count").textContent = state.devices.length ? disabledEntities : "—";
  if (!state.devices.length || !state.catalogue || !state.baseline) {
    $("#changed-count").textContent = "—";
    return;
  }
  const changed = state.devices.filter(previewChanged).length;
  $("#changed-count").textContent = changed;
}

function selectView(view) {
  const rulesSelected = view === "rules";
  $("#rules-view").hidden = !rulesSelected;
  $("#dashboards-view").hidden = rulesSelected;
  $("#discover").hidden = !rulesSelected;
  $("#save").hidden = !rulesSelected;
  for (const tab of document.querySelectorAll(".app-tab")) {
    const selected = tab.dataset.view === view;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  if (!rulesSelected) void loadDashboardStatus();
}

async function loadDashboardStatus() {
  const copy = $("#battery-dashboard-status");
  try {
    const result = await api("dashboard");
    copy.textContent = result.dashboard
      ? `Installed as “${result.dashboard.title}” with ${result.dashboard.icon || "the default Home Assistant icon"}. Existing user settings are preserved during app updates.`
      : "Not installed yet. The app will create it automatically with the SmartFamilyOps defaults.";
  } catch (error) {
    copy.textContent = `Dashboard status unavailable: ${error.message}`;
  }
}

async function provisionDashboard() {
  const button = $("#provision-dashboard");
  button.disabled = true;
  $("#battery-dashboard-status").textContent = "Applying the SmartFamilyOps Battery Health dashboard defaults…";
  try {
    const result = await api("dashboard/provision", { method: "POST", body: "{}" });
    $("#battery-dashboard-status").textContent = result.created
      ? "Battery Health was installed and added to the Home Assistant sidebar."
      : "Battery Health now uses the shipped title, icon and canonical SmartFamilyOps path; its dashboard content was preserved.";
  } catch (error) {
    $("#battery-dashboard-status").textContent = `Dashboard provisioning failed safely: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

function renderRules() {
  const container = $("#rule-list");
  container.replaceChildren();
  for (const [index, rule] of (state.catalogue?.rules ?? []).entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `rule-card${rule.id === state.selected ? " active" : ""}${rule.enabled ? "" : " off"}`;
    const name = document.createElement("b");
    name.textContent = `${index + 1}. ${rule.name || "Untitled rule"}`;
    const outcome = document.createElement("span");
    const role = rule.source_role && rule.source_role !== "standalone" ? ` · ${rule.source_role}` : "";
    const scope = rule.battery_health === "exclude" ? " · Battery Health excluded" : rule.battery_health === "include" ? " · Battery Health included" : "";
    outcome.textContent = `${rule.enabled ? rule.function || "No function" : "Disabled"}${role}${scope} · ${rule.conditions.length} condition${rule.conditions.length === 1 ? "" : "s"}`;
    button.append(name, outcome);
    button.addEventListener("click", () => { state.selected = rule.id; renderRules(); renderEditor(); });
    container.append(button);
  }
}

function option(value, label, selected) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  element.selected = value === selected;
  return element;
}

function renderConditions(rule) {
  const container = $("#conditions");
  container.replaceChildren();
  for (const [index, condition] of rule.conditions.entries()) {
    const row = document.createElement("div");
    row.className = "condition-row";

    const fieldLabel = document.createElement("label");
    fieldLabel.textContent = "Evidence field";
    const field = document.createElement("select");
    for (const [value, definition] of Object.entries(state.meta.fields)) field.append(option(value, definition.label, condition.field));
    field.addEventListener("change", () => {
      condition.field = field.value;
      const type = state.meta.fields[condition.field].type;
      condition.operator = state.meta.operators[type][0];
      condition.value = type === "boolean" ? "true" : "";
      markDirty();
      renderEditor();
    });
    fieldLabel.append(field);

    const operatorLabel = document.createElement("label");
    operatorLabel.textContent = "Comparison";
    const operator = document.createElement("select");
    const type = state.meta.fields[condition.field].type;
    for (const value of state.meta.operators[type]) operator.append(option(value, value.replaceAll("_", " "), condition.operator));
    operator.addEventListener("change", () => { condition.operator = operator.value; markDirty(); });
    operatorLabel.append(operator);

    const valueLabel = document.createElement("label");
    valueLabel.textContent = type === "boolean" ? "Expected value" : "Value";
    let value;
    if (type === "boolean") {
      value = document.createElement("select");
      value.append(option("true", "Yes", lower(condition.value)), option("false", "No", lower(condition.value)));
    } else {
      value = document.createElement("input");
      value.placeholder = condition.field === "entity_name" ? "e.g. Humidity" : "Enter comparison value";
      value.value = condition.value;
    }
    value.addEventListener("input", () => { condition.value = value.value; markDirty(); });
    valueLabel.append(value);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.title = "Remove condition";
    remove.setAttribute("aria-label", "Remove condition");
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      if (rule.conditions.length === 1) return status("error", "A rule needs evidence", "Add another condition before removing this one.");
      rule.conditions.splice(index, 1);
      markDirty();
      renderEditor();
    });
    row.append(fieldLabel, operatorLabel, valueLabel, remove);
    container.append(row);
  }
}

function bindText(selector, rule, property) {
  const element = $(selector);
  element.value = rule[property] ?? "";
  element.oninput = () => { rule[property] = element.value; markDirty(); };
}

function renderEditor() {
  const rule = selectedRule();
  $("#editor-panel").classList.toggle("active", Boolean(rule));
  $("#empty-editor").hidden = Boolean(rule);
  $("#rule-editor").hidden = !rule;
  if (!rule) return;
  $("#editor-title").textContent = rule.name || "Untitled rule";
  $("#enabled").checked = rule.enabled;
  $("#enabled").onchange = (event) => { rule.enabled = event.target.checked; markDirty(); renderRules(); };
  bindText("#name", rule, "name");
  bindText("#function", rule, "function");
  bindText("#asset-group", rule, "asset_group");
  bindText("#reason", rule, "reason");
  $("#source-role").value = rule.source_role ?? "standalone";
  $("#source-role").onchange = (event) => { rule.source_role = event.target.value; markDirty(); };
  $("#battery-health").value = rule.battery_health ?? "automatic";
  $("#battery-health").onchange = (event) => { rule.battery_health = event.target.value; markDirty(); renderRules(); };
  $("#match").value = rule.match;
  $("#match").onchange = (event) => { rule.match = event.target.value; markDirty(); };
  const index = state.catalogue.rules.indexOf(rule);
  $("#move-up").disabled = index === 0;
  $("#move-down").disabled = index === state.catalogue.rules.length - 1;
  renderConditions(rule);
}

function renderPreview() {
  const body = $("#preview-body");
  body.replaceChildren();
  if (!state.devices.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 9;
    cell.className = "empty-cell";
    cell.textContent = "No Home Assistant devices have been discovered yet.";
    return;
  }
  const filter = $("#device-filter").value;
  const devices = state.devices.filter((device) => {
    const result = classify(state.catalogue, device);
    if (filter === "battery_health") return batteryHealthIncluded(result, device);
    if (filter === "excluded") return !batteryHealthIncluded(result, device);
    if (filter === "all") return result.source_role !== "duplicate";
    if (filter === "duplicates") return result.source_role === "duplicate";
    if (filter === "all_with_duplicates") return true;
    if (filter === "changed") return previewChanged(device);
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(devices.length / PREVIEW_PAGE_SIZE));
  state.previewPage = Math.min(Math.max(1, state.previewPage), totalPages);
  const start = (state.previewPage - 1) * PREVIEW_PAGE_SIZE;
  const pageDevices = devices.slice(start, start + PREVIEW_PAGE_SIZE);
  for (const [pageIndex, device] of pageDevices.entries()) {
    const result = classify(state.catalogue, device);
    const previous = classify(state.baseline, device);
    const row = body.insertRow();
    const number = row.insertCell();
    number.className = "row-number";
    number.textContent = `${start + pageIndex + 1}`;
    const name = row.insertCell();
    const strong = document.createElement("strong");
    strong.textContent = device.name;
    const model = document.createElement("small");
    model.textContent = device.model;
    name.append(strong, model);
    row.insertCell().textContent = device.manufacturer;
    row.insertCell().textContent = device.area;
    const functionCell = row.insertCell();
    functionCell.textContent = result.function;
    if (result.function !== previous.function) {
      const changed = document.createElement("small");
      changed.textContent = `Previously: ${previous.function}`;
      functionCell.append(changed);
    }
    const scopeCell = row.insertCell();
    const included = batteryHealthIncluded(result, device);
    scopeCell.textContent = included ? "Included" : "Excluded";
    const scopeReason = document.createElement("small");
    scopeReason.textContent = result.source_role === "duplicate"
      ? "Duplicate source"
      : result.battery_health === "automatic"
        ? device.battery ? "Battery entity discovered" : "No battery entity discovered"
        : `Rule: ${result.battery_health}`;
    scopeCell.append(scopeReason);
    const assetCell = row.insertCell();
    if (result.asset_group) {
      const asset = document.createElement("strong");
      asset.textContent = result.asset_group;
      const role = document.createElement("small");
      role.textContent = result.source_role === "duplicate" ? "Duplicate source" : "Primary source";
      assetCell.append(asset, role);
    } else {
      assetCell.textContent = "—";
    }
    const ruleCell = row.insertCell();
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = result.rule_name;
    ruleCell.append(pill);
    const entities = row.insertCell();
    entities.textContent = `${device.entity_count}`;
    const disabled = document.createElement("small");
    disabled.textContent = `${device.disabled_entity_count} disabled included`;
    entities.append(disabled);
  }
  if (!devices.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 9;
    cell.className = "empty-cell";
    cell.textContent = filter === "changed" ? "No classifications change with the current draft." : "No devices match this filter.";
  }
  const pagination = $("#preview-pagination");
  pagination.hidden = devices.length <= PREVIEW_PAGE_SIZE;
  $("#preview-page-info").textContent = devices.length
    ? `Rows ${start + 1}–${Math.min(start + PREVIEW_PAGE_SIZE, devices.length)} of ${devices.length} · Page ${state.previewPage} of ${totalPages}`
    : "0 rows";
  $("#preview-previous").disabled = state.previewPage === 1;
  $("#preview-next").disabled = state.previewPage === totalPages;
}

function addRule() {
  const rule = {
    id: crypto.randomUUID(), name: "New rule", enabled: true, match: "all",
    function: "Battery device", reason: "Deterministic classification evidence", asset_group: "", source_role: "standalone", battery_health: "automatic",
    conditions: [{ field: "manufacturer", operator: "equals", value: "" }],
  };
  state.catalogue.rules.push(rule);
  state.selected = rule.id;
  markDirty();
  renderEditor();
}

function moveSelected(offset) {
  const index = state.catalogue.rules.findIndex((rule) => rule.id === state.selected);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= state.catalogue.rules.length) return;
  const [rule] = state.catalogue.rules.splice(index, 1);
  state.catalogue.rules.splice(target, 0, rule);
  markDirty();
  renderEditor();
}

async function discover() {
  $("#discover").disabled = true;
  status("waiting", "Discovering devices", "Reading Home Assistant device, entity and area registries.");
  try {
    const result = await api("discovery");
    state.devices = result.devices;
    state.previewPage = 1;
    status(state.dirty ? "waiting" : "ok", state.dirty ? "Unpublished changes" : "Catalogue loaded", `${state.devices.length} devices discovered, including disabled registered entities.`);
    renderSummary();
    renderPreview();
  } catch (error) {
    status("error", "Discovery failed", error.message);
  } finally {
    $("#discover").disabled = false;
  }
}

async function validateDraft() {
  status("waiting", "Validating draft", "Checking the rule schema and compiling the generated Jinja in Home Assistant.");
  try {
    await api("validate", { method: "POST", body: JSON.stringify({ catalogue: state.catalogue, devices: state.devices }) });
    $("#validation-errors").hidden = true;
    $("#confirm-copy").textContent = `${state.catalogue.rules.filter((rule) => rule.enabled).length} enabled rules passed catalogue and Home Assistant Jinja validation. Publishing discovers current devices, creates one recovery set, writes the classifier and managed device catalogue, then reloads custom templates.`;
    $("#confirm-dialog").showModal();
    status("ok", "Validation passed", "Review the publish confirmation. No live file has changed yet.");
  } catch (error) {
    const errors = error.details.length ? error.details.join("\n") : error.message;
    $("#validation-errors").textContent = errors;
    $("#validation-errors").hidden = false;
    $("#confirm-copy").textContent = "The draft cannot be published until these issues are fixed.";
    $("#confirm-dialog").showModal();
    $("#confirm-save").disabled = true;
    status("error", "Validation failed", "Open the confirmation panel for the exact fields to correct.");
  }
}

async function publish() {
  $("#confirm-save").disabled = true;
  $("#save").disabled = true;
  status("waiting", "Publishing rules and devices", "Refreshing discovery, creating one recovery set and writing both generated templates.");
  try {
    const result = await api("save", { method: "POST", body: JSON.stringify({ catalogue: state.catalogue, base_revision: state.revision }) });
    state.revision = result.revision;
    state.baseline = clone(state.catalogue);
    state.dirty = false;
    $("#confirm-dialog").close();
    status("ok", "Rules and device catalogue published", `${result.device_count} Battery Health devices were published. Home Assistant custom templates reloaded successfully; the prior pair is retained as one recovery set.`);
    renderSummary();
    renderRules();
    renderPreview();
  } catch (error) {
    status("error", "Publish failed safely", error.message);
    $("#validation-errors").textContent = error.message;
    $("#validation-errors").hidden = false;
  } finally {
    $("#confirm-save").disabled = false;
    $("#save").disabled = !state.dirty;
  }
}

async function initialise() {
  try {
    const [rules, meta] = await Promise.all([api("rules"), api("meta")]);
    state.catalogue = rules.catalogue;
    state.baseline = clone(rules.catalogue);
    state.revision = rules.revision;
    state.meta = meta;
    state.selected = state.catalogue.rules[0]?.id ?? null;
    $("#save").disabled = true;
    renderRules();
    renderEditor();
    renderSummary();
    const title = rules.imported ? "Existing classifier imported" : rules.seeded ? "Starter catalogue ready" : "Catalogue loaded";
    const detail = rules.imported
      ? `${rules.imported_branch_count} existing Jinja branches were translated into editable rules. The source file remains unchanged until publication.`
      : rules.seeded
        ? "Review the seeded SmartFamilyOps rules before the first publish."
        : `Loaded revision ${rules.revision}.`;
    status("ok", title, detail);
    await discover();
  } catch (error) {
    status("error", "Builder could not start", error.message);
  }
}

$("#add-rule").addEventListener("click", addRule);
$("#add-condition").addEventListener("click", () => {
  const rule = selectedRule();
  rule.conditions.push({ field: "entity_name", operator: "equals", value: "" });
  markDirty();
  renderEditor();
});
$("#move-up").addEventListener("click", () => moveSelected(-1));
$("#move-down").addEventListener("click", () => moveSelected(1));
$("#duplicate").addEventListener("click", () => {
  const source = selectedRule();
  const copy = clone(source);
  copy.id = crypto.randomUUID();
  copy.name = `${source.name} copy`;
  const index = state.catalogue.rules.indexOf(source);
  state.catalogue.rules.splice(index + 1, 0, copy);
  state.selected = copy.id;
  markDirty();
  renderEditor();
});
$("#delete-rule").addEventListener("click", () => {
  const rule = selectedRule();
  if (!rule || !confirm(`Delete “${rule.name}”? This remains reversible until you publish.`)) return;
  const index = state.catalogue.rules.indexOf(rule);
  state.catalogue.rules.splice(index, 1);
  state.selected = state.catalogue.rules[index]?.id ?? state.catalogue.rules[index - 1]?.id ?? null;
  markDirty();
  renderEditor();
});
$("#device-filter").addEventListener("change", () => { state.previewPage = 1; renderPreview(); });
$("#preview-previous").addEventListener("click", () => { state.previewPage -= 1; renderPreview(); });
$("#preview-next").addEventListener("click", () => { state.previewPage += 1; renderPreview(); });
$("#discover").addEventListener("click", discover);
$("#open-apps").addEventListener("click", () => {
  window.top.location.assign("/config/apps/installed");
});
$("#reload-app").addEventListener("click", () => {
  if (state.dirty && !confirm("Reload the app interface and discard the unpublished rule edits in this browser?")) return;
  window.location.reload();
});
$("#provision-dashboard").addEventListener("click", provisionDashboard);
$("#save").addEventListener("click", validateDraft);
$("#confirm-save").addEventListener("click", (event) => { event.preventDefault(); void publish(); });
$("#confirm-dialog").addEventListener("close", () => { $("#confirm-save").disabled = false; });
for (const tab of document.querySelectorAll(".app-tab")) {
  tab.addEventListener("click", () => selectView(tab.dataset.view));
}

void initialise();
