# Changelog

## 0.11.0

- Add **Create new dashboard** for independent SmartFamilyOps list dashboards with their own route, metadata, managed view and population policy.
- Keep fresh dashboards intentionally simple: a generated table is the first supported presentation type, while classification rules remain shared and dashboard scope remains independent.

## 0.10.5

- Keep Battery Health Edit Device navigation in the current Home Assistant view so origin-relative device routes work consistently in browsers and the Companion app.

## 0.10.4

- Remove the explanatory Home Assistant status and catalogue interpretation paragraphs beneath the Battery Health table.

## 0.10.3

- Keep the branded header and full-width Battery Health table inside one managed vertical stack so Home Assistant panel views render both together.
- Normalise the temporary two-card 0.10.2 layout automatically while preserving unrelated user-authored cards.
- Retarget managed catalogue selectors inside nested stack cards when compatible dashboards are copied.

## 0.10.2

- Give Battery Health the same compact SmartFamilyOps brand header, transparent logo, typography, palette and surface treatment as Front Door Control.
- Package and install the controlled transparent logo locally so the dashboard does not depend on an internet-hosted image.
- Remove the former technical heading and “Protected device telemetry” strapline from the operational dashboard.
- Open **Edit Device** links in a separate browser tab while protecting the originating page from the new tab.

## 0.10.1

- Resolve the displayed device name, area and manufacturer from Home Assistant's live registries on each dashboard render.
- Retain the published catalogue values as fallbacks if a registry lookup is unavailable.
- Allow device and area renames to appear without republishing the discovery catalogue; reload the view if no state change has triggered a render.

## 0.10.0

- Give every compatible dashboard its own automatic-candidate population policy and published device list.
- Add a prominent **Currently editing** dashboard selector above the population-policy editor, including the exact Home Assistant route.
- Make **Open compatible dashboard** select the same dashboard in both the dashboard editor and population-policy editor.
- Copy the source population policy during **Save as new dashboard**, then allow the new dashboard to diverge independently.
- Publish all compatible dashboard populations into one versioned aggregate Jinja catalogue keyed by dashboard definition ID.
- Retarget existing managed dashboard copies from the former shared Battery Health list to their own definition ID during publication, with rollback of files, definitions and dashboard cards if publication fails.

## 0.9.0

- Make the Battery Health **Automatic candidates** policy editable in the app rather than hard-coded in the compiler.
- Support ordered evidence rows with selectable fields, comparisons and values, plus **match any** or **match all** evaluation.
- Preserve the existing battery device-class and battery-named entity checks as backward-compatible defaults.
- Include registered and runtime entity device classes in discovery evidence, including disabled registry entities where Home Assistant supplies their device class.
- Apply candidate-policy changes immediately to preview filters and change counts, then validate, back up and publish them with the governed catalogue.

## 0.8.0

- Open app-owned compatible dashboard definitions in the Dashboard Builder and maintain their Home Assistant title, icon, description, sidebar and administrator settings.
- Save a compatible dashboard as a new hidden, administrator-only draft with a new UUID, collision-safe SmartFamilyOps route, cloned Lovelace configuration and app-owned manifest.
- Mark managed Lovelace configuration with a versioned SmartFamilyOps ownership contract and roll back incomplete dashboard creation or editing.
- Rename the Battery Health **Tools** column to **Edit Device**.

## 0.7.3

- Surface the complete Battery Health discovery scope above the ordered classification rules.
- Show that automatic membership starts with battery device-class or battery-named entity evidence, then applies rule, duplicate-source and Home Assistant label decisions.

## 0.7.2

- Add a tools link for every Battery Health row that opens the matching native Home Assistant device page.
- Generate rule identifiers in Home Assistant HTTP ingress even when `crypto.randomUUID()` is unavailable, fixing Add Rule and Duplicate Rule.
- Upgrade a recognised managed Battery Health card on app startup when the complete classification publication is present, while preserving unrelated user cards.

## 0.7.1

- Detect an incomplete publication set after upgrading from an earlier release.
- Enable **Validate & publish** when the new managed device catalogue still needs to be generated, even when classification rules are unchanged.
- Clear the migration prompt only after the complete rules-and-device publication succeeds.

## 0.7.0

- Move Battery Health device membership out of the dashboard and into a published, installation-specific device catalogue.
- Generate `smartfamilyops_device_catalogue.jinja` alongside the reusable classification template so explicitly included and offline devices remain visible even when no battery state is available.
- Publish the rule source, classifier, device snapshot and catalogue template as one recoverable set, with validation and rollback across all four files.
- Preserve `battery_monitor` and `battery_ignore` label behaviour while making the builder the governing membership surface.
- Upgrade only the recognised SmartFamilyOps managed markdown card after a successful catalogue publication; preserve unrelated user cards.
- Keep current battery, power and availability values live at dashboard-render time while function and membership remain deterministic until the next publication.

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
