# Changelog

## 0.6.2

- Rename the Home Assistant sidebar panel to **Dashboard Builder** and use `mdi:view-dashboard-edit`.
- Broaden the app-store description to describe reusable discovery dashboards and their deterministic classification rules.

## 0.6.1

- Migrate the earlier `/smartfamilyops-dashboard/SmartFamilyOps-battery-health` route to `/smartfamilyops-dashboards/battery-health` by copying the existing dashboard configuration before removing the legacy registration.
- Roll back the new dashboard if its copied configuration cannot be saved, leaving the legacy dashboard unchanged.

## 0.6.0

- Rename the app to **SmartFamilyOps Discovery Dashboard Builder** while retaining the existing technical slug and managed-file locations.
- Use the concise canonical Battery Health route `/smartfamilyops-dashboards/battery-health`.
- Keep **Classification Rules** as the name of the rule-authoring workspace inside the broader dashboard-building app.

## 0.5.1

- Run the test files directly so the release workflow works on the app's supported Node.js 22 runtime.

## 0.5.0

- Provision the Battery Health dashboard on first app start with the shipped SmartFamilyOps title, `mdi:battery-sync` icon and canonical route.
- Preserve an existing dashboard during app starts and upgrades.
- Add a Dashboard Builder action that reapplies the shipped metadata without replacing existing cards.
- Keep the Home Assistant-compatible `smartfamilyops-dashboard` URL key because custom dashboard keys must contain a hyphen.

## 0.4.4

- Replace the unsuccessful in-app Supervisor update check with direct navigation to Home Assistant's installed-apps page.
- Remove unnecessary Supervisor API access instead of granting the app an elevated manager role solely for store refreshes.
- Keep update refresh and installation under the authenticated Home Assistant user session.

## 0.4.3

- Strengthen the Rules and Rule Details relationship with a shared branded blue selection surface.
- Give the Rules column a persistent blue treatment and clearer selected-rule elevation.
- Apply SmartFamilyOps blue and teal tints to the catalogue summary cards.

## 0.4.2

- Present device and entity totals with green active and red inactive breakdowns.
- Grant the app authenticated Supervisor API access for app-store refresh checks.
- Report readable Supervisor HTTP errors instead of exposing JSON parser failures.

## 0.4.1

- Show enabled entity and offline device totals in the catalogue summary.
- Treat a device as online when at least one enabled entity has a usable runtime state.
- Reflow the six summary cards across desktop, tablet and mobile widths.

## 0.4.0

- Publish the Classification Rule Builder from its own Home Assistant app repository.
- Add the SmartFamilyOps icon and logo used by the SwitchBot Bridge app.
- Point app metadata and documentation to the standalone canonical repository.
- Include the Battery Health discovery dashboard as a maintained example.

## 0.3.1

- Add an in-app Home Assistant app-store refresh and version check.
- Add a safe app-interface reload control and prevent cached frontend assets from hiding a newly installed interface.
- Clarify that discovery refreshes Home Assistant device, entity and area data while preserving unpublished rule edits.

## 0.3.0

- Move the classification catalogue into a dedicated in-app configuration tab.
- Add the Dashboard Builder configuration shell and shared-catalogue design preview.

## 0.2.5

- Match the Rule Details panel background to the selected rule highlight.

## 0.2.4

- Highlight the selected rule with a pale blue background and clearer outline.

## 0.2.3

- Constrain long rule names to the rules column so they cannot overlap the editor.

## 0.2.2

- Add continuous row numbering to the device preview.
- Paginate filtered preview results at 20 rows per page.

## 0.2.1

- Add an Apple/iPhone runtime fallback for dashboards that cannot inspect disabled mobile-app registry entities.

## 0.2.0

- Make Battery Health dashboard membership a configurable rule outcome: automatic, include or exclude.
- Classify and exclude mobile phones using registered SIM or BSSID entity evidence.
- Show dashboard membership and its reason in the device preview.
- Publish a source-controlled Battery Health card that consumes catalogue membership and duplicate-source decisions.

## 0.1.2

- Evaluate the specific BILRESA scroll-wheel rule before the broader dual-button rule when all three switch-position entities are registered.

## 0.1.1

- Keep seeded rule identifiers stable so a first publish after importing the legacy classifier does not falsely trigger the stale-save guard.

## 0.1.0

- Initial local Home Assistant App.
- Structured classification-rule editor and device preview.
- Existing SmartFamilyOps classifier import.
- Disabled-entity discovery.
- Logical asset grouping with primary and duplicate sources.
- Home Assistant Jinja validation, versioned backups and rollback.
