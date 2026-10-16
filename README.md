# SmartFamilyOps Discovery Dashboard Builder

SmartFamilyOps Discovery Dashboard Builder is a Home Assistant app for building discovery dashboards backed by deterministic, reusable device-classification rules. Its visual rule workspace removes the need to hand-edit Jinja.

Battery Health dashboard population is also maintained visually: users can edit the automatic candidate fields, comparisons, values and `any`/`all` matching before previewing and publishing the governed catalogue.

## Install in Home Assistant

This is a Home Assistant **app repository**. In Home Assistant, open **Settings → Apps → App store → Repositories**, add:

```text
https://github.com/SmartFamilyOps/homeassistant-classification-rule-builder
```

Refresh the app store, install **SmartFamilyOps Discovery Dashboard Builder**, start it and open its Web UI.

Home Assistant apps were formerly called add-ons. HACS installs custom integrations and frontend components; it does not install this containerized app. A future HACS edition would be a separate custom-integration package.

## Install a specific version

Repository refs allow compatibility testing against a maintained release branch or tag. Add the repository with the required ref appended, for example:

```text
https://github.com/SmartFamilyOps/homeassistant-classification-rule-builder#v0.4.0
```

Use the unqualified repository URL for the current stable release. Back up the app and its managed catalogue before changing between versions.

## Repository layout

- `classification_rule_builder/` — installable Home Assistant app
- `examples/battery-health-dashboard/` — SmartFamilyOps discovery-dashboard example

On first start, the app provisions a missing Battery Health dashboard with the
`mdi:battery-sync` sidebar icon at
`/smartfamilyops-dashboards/battery-health`. Existing dashboard
customisations are preserved during upgrades.
- `.github/workflows/test.yml` — automated catalogue and packaging checks

The app writes its catalogue to `/config/smartfamilyops/classification-rule-builder/classification_rules.json` and generates `/config/custom_templates/smartfamilyops_device_classification.jinja` after validation.

See [the app documentation](classification_rule_builder/README.md) for behaviour, recovery and the dashboard input contract.
