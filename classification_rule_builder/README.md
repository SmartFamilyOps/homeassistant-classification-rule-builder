# SmartFamilyOps Discovery Dashboard Builder

SmartFamilyOps Discovery Dashboard Builder creates reusable discovery dashboards backed by deterministic device-classification rules. Its visual rule workspace removes the need to hand-edit Jinja.

The app configuration is organised into two in-app sections:

- **Classification Rules** contains the shared, ordered rule catalogue, device discovery preview and safe publication workflow.
- **Dashboard Builder** provides the configuration shell for reusable discovery dashboards. Dashboard definitions will reference the shared catalogue instead of copying classification logic.

## What it does

- Discovers Home Assistant devices, areas and registered entities through Home Assistant's authenticated APIs.
- Includes entities disabled by an integration because discovery reads the entity registry rather than only live states.
- Builds ordered rules from safe fields, comparisons and `all`/`any` condition groups.
- Previews the resulting function for each device before publication.
- Numbers preview rows continuously and paginates filtered results at 20 devices per page.
- Validates both generated Jinja templates in Home Assistant before changing live files.
- Creates one versioned recovery set containing the rules, classifier, device snapshot and generated device catalogue.
- Writes the complete publication set atomically and reloads custom templates only after validation.
- Restores the complete previous set if a write or reload fails.
- Rejects stale saves when another browser session has changed the catalogue.
- Groups multiple Home Assistant records that represent one physical asset and marks primary or duplicate sources explicitly.
- Makes Battery Health dashboard membership an explicit rule outcome: include, exclude, or automatic when a battery entity exists.
- Shows the complete Battery Health population policy above the rule editor so automatic battery evidence and label overrides are visible rather than hidden in the compiler.
- Recognises and imports the established SmartFamilyOps Jinja classifier on first run; an unfamiliar template is refused rather than overwritten.
- Opens Home Assistant's installed-apps page for update checks and app management without granting this app elevated Supervisor permissions.
- Reloads the app interface on demand and serves frontend assets without browser caching so a newly installed interface appears immediately.
- Creates the Battery Health dashboard on first start when the canonical SmartFamilyOps dashboard is absent, using the shipped title, icon, route and maintained card.
- Preserves unrelated dashboard cards during app starts and upgrades. Once the complete managed catalogue exists, a new app version upgrades only the recognised SmartFamilyOps managed Battery Health card; user-authored cards remain untouched.
- Links each Battery Health row to its native Home Assistant device page through the stable device registry ID.

## Managed files

The app stores its source catalogue at:

```text
/config/smartfamilyops/classification-rule-builder/classification_rules.json
```

It generates the Home Assistant custom template at:

```text
/config/custom_templates/smartfamilyops_device_classification.jinja
```

At publication time it also records the installation-specific device snapshot at:

```text
/config/smartfamilyops/classification-rule-builder/device_catalogue.json
```

and generates the presentation catalogue consumed by Home Assistant dashboards at:

```text
/config/custom_templates/smartfamilyops_device_catalogue.jinja
```

Backups are kept beneath:

```text
/config/smartfamilyops/classification-rule-builder/backups/
```

Both Jinja files are generated outputs. Edit rules and membership through the app and publish again instead of changing generated files by hand. The existing `classification-rule-builder` data path remains stable for upgrade compatibility even though the visible product name is now Discovery Dashboard Builder.

## Why there are two generated Jinja files

The files have different authority and change cycles:

| File | Responsibility | Portability | Changes when |
| --- | --- | --- | --- |
| `smartfamilyops_device_classification.jinja` | Reusable ordered rules that classify one supplied device | Portable across Home Assistant installations | A classification rule is published |
| `smartfamilyops_device_catalogue.jinja` | Evaluated membership and stable IDs for devices in this Home Assistant installation | Installation-specific | Discovery is refreshed and the catalogue is published |

This separation prevents a routine device refresh from rewriting the decision engine. It also keeps local device IDs out of the portable SmartFamilyOps rule design. The dashboard performs presentation and live-state lookup only; it no longer contains the authoritative battery-device discovery filter.

The cost is that device additions, registry changes and label overrides are not reflected in dashboard membership until **Refresh Home Assistant data** and **Validate & publish** complete. Current state values remain live between publications.

## Classification and catalogue contracts

The builder supplies each discovered device to `classify_device`. The managed classifier accepts:

| Key | Value |
| --- | --- |
| `name` | Home Assistant device name |
| `manufacturer` | Device manufacturer |
| `area` | Home Assistant area |
| `entity_names` | Lowercase list of registered entity names or normalized entity-ID names |
| `entity_ids` | Lowercase list of registered entity IDs |
| `camera_evidence` | Boolean derived from camera-specific registered entities |

The returned classification also includes `asset_group`, `source_role` and `battery_health`.
`source_role` is one of `standalone`, `primary` or `duplicate`. A dashboard can
hide duplicate rows by default while retaining a user-controlled “show
duplicates” view. The starter catalogue groups **Front Door Lock - SwitchBot
Cloud** as the primary source and **Front Door Lock - Bluetooth Diagnostic** as
a duplicate source for the `front-door-lock` logical asset.

`battery_health` is one of `include`, `exclude` or `automatic`. Automatic
membership includes a device when discovery finds a battery entity. This keeps
the default useful for new devices while allowing rules such as mobile-phone
evidence to exclude devices deliberately. Include forces membership even if no
battery entity is recognised; the dashboard then shows an unknown battery icon.
The published device catalogue consumes this result, so membership is maintained
in the builder rather than hard-coded in the dashboard.

`battery_monitor` and `battery_ignore` Home Assistant labels remain supported for
compatibility. Monitor wins as an explicit inclusion; ignore removes an automatic
or rule-included device. These registry labels are evaluated during publication.

The rules workspace displays this membership precedence above the ordered rules.
Automatic battery evidence means an entity whose runtime `device_class` is
`battery`, or a registered entity ID containing `battery`. Rule-level inclusion or
exclusion and duplicate-source handling are then applied, while `battery_monitor`
and `battery_ignore` remain explicit Home Assistant label overrides.

The Battery Health dashboard imports `battery_health_devices` from the generated
device catalogue. Each record contains stable device and entity IDs, registry
metadata, the evaluated function and membership evidence. The dashboard reads
current states for those IDs when it renders, so offline devices stay listed and
live battery values do not require republishing.

The Battery Health **Edit Device** column opens `/config/devices/device/{device_id}`.

The **Dashboard Builder** tab can open any compatible SmartFamilyOps dashboard and save it as a new governed draft. A draft receives a new UUID, a collision-safe `smartfamilyops-dashboards-*` route, a copied Lovelace configuration, an app-owned manifest, administrator-only access and no sidebar entry by default. Existing compatible dashboards can be renamed and have their description, icon, sidebar visibility and administrator access maintained from the same editor.
This hands configuration back to Home Assistant's native device page and remains
valid when a device is renamed because it uses the registry ID rather than the
display name.

The starter catalogue keeps SIM/BSSID registry evidence as the strongest mobile
phone rule. It also includes an Apple/iPhone fallback because Home Assistant
dashboard templates cannot always inspect entities disabled in the registry,
even though the builder can discover them through the authenticated registry API.

`label` remains accepted as a fallback for older dashboards that have not yet renamed the device-name key.
The generated starter rules also recognise the existing `has_switch_position_1`,
`has_switch_position_2`, `has_switch_position_9`, `has_humidity`,
`has_radar_triggered_distance` and `camera` fields while the Battery Health
dashboard is migrated to the generic lists.

## Installation

Add this GitHub repository to Home Assistant's app-store repositories, refresh the app store, install **SmartFamilyOps Discovery Dashboard Builder**, and start it. The app appears in the Home Assistant sidebar through ingress and does not publish a LAN port.

The installed ingress URL is derived from the repository identifier assigned by
Home Assistant and the stable app slug `classification_rule_builder`. The
visible product name can evolve without changing that slug; changing the slug
would create a second app identity and complicate upgrades.

On first start, the app checks for the canonical Battery Health dashboard. If it
is missing, the app creates it in storage mode with **Battery Health** as the
sidebar title, `mdi:battery-sync` as the icon, and this route:

```text
/smartfamilyops-dashboards/battery-health
```

Home Assistant requires a custom dashboard URL key to contain a hyphen, so
`smartfamilyops` is not a valid first route segment. Existing dashboard metadata
and unrelated cards are left unchanged during app restarts and upgrades. The
recognised SmartFamilyOps managed card is upgraded when the complete managed
publication exists. Use the Dashboard Builder's explicit defaults action when
the shipped title and icon should replace local metadata.

The **Classification Rules** and **Dashboard Builder** tabs are inside **Open Web UI** (and the app's sidebar page). Home Assistant's outer **Info**, **Documentation**, **Configuration** and **Log** tabs are fixed app-management tabs. Use **Open Home Assistant Apps** to go directly to Home Assistant's installed-apps page, where its own refresh control checks for updates. **Refresh Home Assistant data** re-reads device, entity and area discovery without replacing unpublished rule edits. **Reload app interface** reconnects the ingress page and warns before discarding unpublished edits.

On its first run, it presents a starter catalogue containing the rules already established for BILRESA controls, the SwitchBot Keypad Vision Pro, TIMMERFLOTTE, cameras, motion detectors, locks and contact sensors. Nothing is written until **Validate & publish** is selected and confirmed. Publication performs a fresh server-side discovery, so the saved catalogue does not rely on a stale browser payload.

The starter catalogue is distributed with the app and becomes app-owned structured configuration when published. Generated Jinja remains an output rather than the source of truth.

If the established SmartFamilyOps classifier already exists, the app recognises
its known nine-branch contract and translates it into editable rules. The live
Jinja file remains untouched until publication. An unrecognised classifier is
reported as an import error and is never silently replaced.

## Recovery

If a published rule is logically wrong but valid, use the app to correct or reorder it and publish again. For manual recovery, restore all four files from the same timestamped recovery set—the rules JSON, classifier Jinja, device-catalogue JSON and device-catalogue Jinja—then run the Home Assistant action `homeassistant.reload_custom_templates`.

The builder never stores a Home Assistant token. Its protected container receives the short-lived Supervisor token at runtime and uses it only through Home Assistant's Core API proxy for registry discovery, validation and template reload.
