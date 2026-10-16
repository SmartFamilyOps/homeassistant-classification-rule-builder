import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summariseAppInfo } from "../src/home-assistant.mjs";

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

test("the app exposes refresh, update-check and interface-reload controls", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(html, /id="discover"[^>]*>Refresh Home Assistant data</);
  assert.match(html, /id="check-updates"[^>]*>Check for app updates</);
  assert.match(html, /id="reload-app"[^>]*>Reload app interface</);
  assert.match(script, /api\("app-update-check"/);
  assert.match(script, /window\.location\.reload\(\)/);
});
