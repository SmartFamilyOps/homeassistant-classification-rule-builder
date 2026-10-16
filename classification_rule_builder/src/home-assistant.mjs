const HA_URL = (process.env.HA_URL ?? "http://supervisor/core").replace(/\/$/, "");
const HA_WS_URL = process.env.HA_WS_URL ?? "ws://supervisor/core/api/websocket";
const HA_TOKEN = process.env.HA_TOKEN ?? "";

async function request(path, options = {}) {
  const response = await fetch(`${HA_URL}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${HA_TOKEN}`,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Home Assistant returned HTTP ${response.status} for ${path}.`);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

async function websocketSession(callback) {
  const socket = new WebSocket(HA_WS_URL);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Home Assistant WebSocket connection timed out.")), 15_000);
    socket.addEventListener("open", () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Cannot connect to Home Assistant WebSocket.")); }, { once: true });
  });
  try {
    await receive(socket);
    socket.send(JSON.stringify({ type: "auth", access_token: HA_TOKEN }));
    const auth = await receive(socket);
    if (auth.type !== "auth_ok") throw new Error("Home Assistant WebSocket authentication failed.");
    let id = 0;
    return await callback(async (type, fields = {}) => {
      const command = { id: ++id, type, ...fields };
      socket.send(JSON.stringify(command));
      const response = await receive(socket);
      if (!response.success) {
        const detail = response.error?.message || response.error?.code || "unknown error";
        throw new Error(`Home Assistant WebSocket request failed: ${type}: ${detail}.`);
      }
      return response.result;
    });
  } finally {
    socket.close();
  }
}

export async function validateTemplate(template) {
  await request("/api/template", { method: "POST", body: JSON.stringify({ template }) });
}

export async function reloadCustomTemplates() {
  await request("/api/services/homeassistant/reload_custom_templates", { method: "POST", body: "{}" });
}

function receive(socket) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Home Assistant WebSocket timed out.")), 15_000);
    socket.addEventListener("message", (event) => {
      clearTimeout(timeout);
      try { resolve(JSON.parse(event.data)); } catch (error) { reject(error); }
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("Home Assistant WebSocket failed."));
    }, { once: true });
  });
}

async function registries() {
  return websocketSession(async (call) => {
    const results = [];
    for (const type of ["config/device_registry/list", "config/entity_registry/list", "config/area_registry/list"]) {
      results.push(await call(type));
    }
    return results;
  });
}

export async function listDashboards() {
  return websocketSession((call) => call("lovelace/dashboards/list"));
}

export async function createDashboard(metadata) {
  return websocketSession((call) => call("lovelace/dashboards/create", metadata));
}

export async function updateDashboard(dashboardId, metadata) {
  return websocketSession((call) => call("lovelace/dashboards/update", { dashboard_id: dashboardId, ...metadata }));
}

export async function deleteDashboard(dashboardId) {
  return websocketSession((call) => call("lovelace/dashboards/delete", { dashboard_id: dashboardId }));
}

export async function saveDashboardConfig(urlPath, config) {
  return websocketSession((call) => call("lovelace/config/save", { url_path: urlPath, config }));
}

export async function loadDashboardConfig(urlPath) {
  return websocketSession((call) => call("lovelace/config", { url_path: urlPath }));
}

const cameraTerms = ["person", "vehicle", "animal", "snapshot", "record", "stream", "privacy", "pir"];
const configurationDomains = new Set(["button", "number", "select", "update", "scene", "automation"]);

function entityLabels(entity) {
  return Array.isArray(entity.labels) ? entity.labels : [];
}

export function deviceEntityEvidence(deviceEntities, statesById) {
  const batteryCandidates = deviceEntities.filter((entity) => {
    const state = statesById.get(entity.entity_id);
    return state?.attributes?.device_class === "battery" || entity.entity_id.includes("battery");
  });
  batteryCandidates.sort((left, right) => Number(Boolean(left.disabled_by)) - Number(Boolean(right.disabled_by)));
  const batteryEntity = batteryCandidates[0];
  const relevantEntityIds = deviceEntities
    .filter((entity) => !entity.disabled_by && !configurationDomains.has(entity.entity_id.split(".")[0]))
    .map((entity) => entity.entity_id);
  return {
    battery: batteryCandidates.length > 0,
    battery_entity_id: batteryEntity?.entity_id ?? "",
    battery_ignore: batteryCandidates.some((entity) => entityLabels(entity).includes("battery_ignore")),
    battery_monitor: batteryCandidates.some((entity) => entityLabels(entity).includes("battery_monitor")),
    relevant_entity_ids: relevantEntityIds,
  };
}

export function summariseDeviceEntities(deviceEntities, statesById) {
  const enabledEntities = deviceEntities.filter((entity) => !entity.disabled_by);
  const online = enabledEntities.some((entity) => {
    const state = statesById.get(entity.entity_id)?.state;
    return state !== undefined && state !== "unavailable" && state !== "unknown";
  });
  return {
    enabled_entity_count: enabledEntities.length,
    disabled_entity_count: deviceEntities.length - enabledEntities.length,
    online,
  };
}

export async function discoverDevices() {
  const [devices, entities, areas] = await registries();
  const states = await request("/api/states");
  const statesById = new Map(states.map((state) => [state.entity_id, state]));
  const areaById = new Map(areas.map((area) => [area.area_id, area.name]));
  const entitiesByDevice = new Map();
  for (const entity of entities) {
    if (!entity.device_id) continue;
    const list = entitiesByDevice.get(entity.device_id) ?? [];
    list.push(entity);
    entitiesByDevice.set(entity.device_id, list);
  }

  return devices.map((device) => {
    const deviceEntities = entitiesByDevice.get(device.id) ?? [];
    const entityNames = deviceEntities.map((entity) => {
      const state = statesById.get(entity.entity_id);
      return entity.name || entity.original_name || state?.attributes?.friendly_name || entity.entity_id.split(".")[1].replaceAll("_", " ");
    });
    const evidence = [...entityNames, ...deviceEntities.map((entity) => entity.entity_id)].map((value) => value.toLocaleLowerCase("en-GB"));
    const deviceEvidence = deviceEntityEvidence(deviceEntities, statesById);
    const entitySummary = summariseDeviceEntities(deviceEntities, statesById);
    return {
      id: device.id,
      name: device.name_by_user || device.name || "Unnamed device",
      manufacturer: device.manufacturer || "Unknown",
      model: device.model || "Unknown",
      area: areaById.get(device.area_id) || "Unassigned",
      entity_names: entityNames,
      entity_ids: deviceEntities.map((entity) => entity.entity_id),
      ...entitySummary,
      entity_count: deviceEntities.length,
      ...deviceEvidence,
      camera_evidence: cameraTerms.some((term) => evidence.some((value) => value.includes(term))),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
