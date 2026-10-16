# SmartFamilyOps Discovery Dashboard Builder

Use the **Web UI** tab to maintain deterministic device-classification rules without editing Jinja.

Use the **Classification Rules** tab to maintain the shared catalogue. The **Dashboard Builder** tab is the configuration home for reusable discovery dashboards that consume the same catalogue.

The **Battery Health discovery scope** panel above the rules makes dashboard population explicit. Automatic candidates have an entity with runtime `device_class = battery` or a registered entity ID containing `battery`; ordered rules, duplicate handling and the `battery_monitor` / `battery_ignore` labels then determine the final membership.

These tabs are inside **Open Web UI** and the app's sidebar page. They do not replace Home Assistant's fixed **Info**, **Documentation**, **Configuration** and **Log** app-management tabs.

Use **Refresh Home Assistant data** to re-read device, entity and area discovery while preserving unpublished rule edits. Use **Open Home Assistant Apps** to review installed versions and run Home Assistant's own update refresh. Use **Reload app interface** to reconnect the ingress UI; the app warns before discarding unpublished edits.

On first launch, the app reads the existing SmartFamilyOps classifier from Home Assistant. A recognised legacy catalogue is translated into editable rules. No live file changes until **Validate & publish** is confirmed.

Publication performs six guarded steps:

1. Validate the structured catalogue.
2. Ask Home Assistant to compile the reusable classification Jinja.
3. Refresh device, entity and area discovery on the server.
4. Evaluate Battery Health membership and compile the installation-specific device-catalogue Jinja.
5. Back up and atomically replace the rules, classifier, device snapshot and catalogue template as one set.
6. Run `homeassistant.reload_custom_templates` and upgrade only the recognised SmartFamilyOps managed dashboard card.

If a write or reload fails, the complete preceding set is restored and Home Assistant reloads it again. Unrelated dashboard cards are not replaced.

After later app upgrades, startup refreshes only the recognised SmartFamilyOps managed Battery Health card when the complete catalogue publication is present. This delivers presentation fixes without treating user-authored cards as app-owned content.

The Battery Health **Edit Device** icon opens the matching native Home Assistant device page using its stable registry ID. Use this pattern for other builder-managed views that need to hand users from discovered data to existing Home Assistant configuration.

The app reads Home Assistant's device, entity and area registries. Disabled registered entities are included as classification evidence without enabling them.

The reusable classifier and local device catalogue are deliberately separate. The classifier is portable SmartFamilyOps logic. The device catalogue contains installation-specific IDs and evaluated dashboard membership. Users manage both through this app; neither generated Jinja file should be edited manually.

See the project README for the dashboard input contract and recovery procedure.
