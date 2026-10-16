# SmartFamilyOps Classification Rule Builder

Use the **Web UI** tab to maintain deterministic device-classification rules without editing Jinja.

Use the **Classification Rules** tab to maintain the shared catalogue. The **Dashboard Builder** tab is the configuration home for reusable discovery dashboards that consume the same catalogue.

These tabs are inside **Open Web UI** and the app's sidebar page. They do not replace Home Assistant's fixed **Info**, **Documentation**, **Configuration** and **Log** app-management tabs.

Use **Refresh Home Assistant data** to re-read device, entity and area discovery while preserving unpublished rule edits. Use **Check for app updates** to refresh Home Assistant's app-store metadata and compare the installed and latest versions. Updates are reviewed and installed on the Home Assistant app page. Use **Reload app interface** to reconnect the ingress UI; the app warns before discarding unpublished edits.

On first launch, the app reads the existing SmartFamilyOps classifier from Home Assistant. A recognised legacy catalogue is translated into editable rules. No live file changes until **Validate & publish** is confirmed.

Publication performs four guarded steps:

1. Validate the structured catalogue.
2. Ask Home Assistant to compile the generated Jinja.
3. Back up and atomically replace the managed catalogue/template pair.
4. Run `homeassistant.reload_custom_templates`.

If reload fails, the preceding files are restored and Home Assistant reloads them again.

The app reads Home Assistant's device, entity and area registries. Disabled registered entities are included as classification evidence without enabling them.

See the project README for the dashboard input contract and recovery procedure.
