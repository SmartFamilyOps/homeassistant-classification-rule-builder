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
    const commands = [
      { id: 1, type: "config/device_registry/list" },
      { id: 2, type: "config/entity_registry/list" },
      { id: 3, type: "config/area_registry/list" },
    ];
    const results = [];
    for (const command of commands) {
      socket.send(JSON.stringify(command));
      const response = await receive(socket);
      if (!response.success) throw new Error(`Home Assistant registry request failed: ${command.type}.`);
      results.push(response.result);
    }
    return results;
  } finally {
    socket.close();
  }
}

const cameraTerms = ["person", "vehicle", "animal", "snapshot", "record", "stream", "privacy", "pir"];

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
    const battery = deviceEntities.some((entity) => {
      const state = statesById.get(entity.entity_id);
      return state?.attributes?.device_class === "battery" || entity.entity_id.includes("battery");
    });
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
      battery,
      camera_evidence: cameraTerms.some((term) => evidence.some((value) => value.includes(term))),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
