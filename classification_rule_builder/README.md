# SmartFamilyOps Classification Rule Builder

SmartFamilyOps Classification Rule Builder is a local Home Assistant app for maintaining deterministic device-classification rules without hand-editing Jinja.

The app configuration is organised into two in-app sections:

- **Classification Rules** contains the shared, ordered rule catalogue, device discovery preview and safe publication workflow.
- **Dashboard Builder** provides the configuration shell for reusable discovery dashboards. Dashboard definitions will reference the shared catalogue instead of copying classification logic.

## What it does

- Discovers Home Assistant devices, areas and registered entities through Home Assistant's authenticated APIs.
- Includes entities disabled by an integration because discovery reads the entity registry rather than only live states.
- Builds ordered rules from safe fields, comparisons and `all`/`any` condition groups.
- Previews the resulting function for each device before publication.
- Numbers preview rows continuously and paginates filtered results at 20 devices per page.
- Validates the structured catalogue and asks Home Assistant to compile the generated Jinja before changing the live classifier.
- Creates versioned backups of the current catalogue and template.
- Writes files atomically and reloads custom templates only after validation.
- Restores the previous files if the reload fails.
- Rejects stale saves when another browser session has changed the catalogue.
- Groups multiple Home Assistant records that represent one physical asset and marks primary or duplicate sources explicitly.
- Makes Battery Health dashboard membership an explicit rule outcome: include, exclude, or automatic when a battery entity exists.
- Recognises and imports the established SmartFamilyOps Jinja classifier on first run; an unfamiliar template is refused rather than overwritten.
- Opens Home Assistant's installed-apps page for update checks and app management without granting this app elevated Supervisor permissions.
- Reloads the app interface on demand and serves frontend assets without browser caching so a newly installed interface appears immediately.

## Managed files

The app stores its source catalogue at:

```text
/config/smartfamilyops/classification-rule-builder/classification_rules.json
```

It generates the Home Assistant custom template at:

```text
/config/custom_templates/smartfamilyops_device_classification.jinja
```

Backups are kept beneath:

```text
/config/smartfamilyops/classification-rule-builder/backups/
```

The generated Jinja is an output. Edit the structured catalogue through the app and publish it again instead of changing the generated file by hand.

## Dashboard input contract

The Battery Health dashboard imports `classify_device` and passes one dictionary per device. The managed classifier accepts:

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
evidence to exclude devices deliberately. The Battery Health dashboard consumes
this result, so its inclusion policy is maintained in the builder.

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

Place this folder in Home Assistant's local apps/add-ons directory, refresh the local app store, install **SmartFamilyOps Classification Rule Builder**, and start it. The app appears in the Home Assistant sidebar through ingress and does not publish a LAN port.

The installed ingress URL is derived from Home Assistant's local repository
prefix and the app `slug`, currently `/app/local_classification_rule_builder`.
Renaming the slug would install a second app identity rather than provide a
cosmetic redirect, so a future branded URL migration must copy the managed
catalogue and app options before the old identity is retired.

The **Classification Rules** and **Dashboard Builder** tabs are inside **Open Web UI** (and the app's sidebar page). Home Assistant's outer **Info**, **Documentation**, **Configuration** and **Log** tabs are fixed app-management tabs. Use **Open Home Assistant Apps** to go directly to Home Assistant's installed-apps page, where its own refresh control checks for updates. **Refresh Home Assistant data** re-reads device, entity and area discovery without replacing unpublished rule edits. **Reload app interface** reconnects the ingress page and warns before discarding unpublished edits.

On its first run, it presents a starter catalogue containing the rules already established for BILRESA controls, the SwitchBot Keypad Vision Pro, TIMMERFLOTTE, cameras, motion detectors, locks and contact sensors. Nothing is written until **Validate & publish** is selected and confirmed.

The starter catalogue is distributed with the app and becomes app-owned structured configuration when published. Generated Jinja remains an output rather than the source of truth.

If the established SmartFamilyOps classifier already exists, the app recognises
its known nine-branch contract and translates it into editable rules. The live
Jinja file remains untouched until publication. An unrecognised classifier is
reported as an import error and is never silently replaced.

## Recovery

If a published rule is logically wrong but valid, use the app to correct or reorder it and publish again. For manual recovery, copy the required paired catalogue/template backup into their managed paths and run the Home Assistant action `homeassistant.reload_custom_templates`.

The builder never stores a Home Assistant token. Its protected container receives the short-lived Supervisor token at runtime and uses it only for registry discovery, validation, template reload and the user-initiated app-store metadata refresh/version check.
