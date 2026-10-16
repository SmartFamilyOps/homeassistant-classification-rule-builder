# SmartFamilyOps Discovery Dashboard Builder

Use the **Web UI** tab to maintain deterministic device-classification rules without editing Jinja.

Use the **Classification Rules** tab to maintain the shared catalogue. The **Dashboard Builder** tab is the configuration home for reusable discovery dashboards that consume the same catalogue.

The discovery-scope panel above the rules is an editable, dashboard-specific population policy. Use **Currently editing** to select the dashboard and verify its route. Add or remove candidate conditions, select the evidence field, comparison and value, and choose whether any or all conditions must match. The shipped Battery Health defaults accept an entity with registered or runtime `device_class = battery`, or a registered entity ID containing `battery`. Ordered shared rules, duplicate handling and the `battery_monitor` / `battery_ignore` labels then determine final membership.

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

The Battery Health **Edit Device** icon opens the matching native Home Assistant device page in the current Home Assistant view using its stable registry ID. The URL is origin-relative (`/config/devices/device/{device_id}`), so it works through the LAN address, the interactive browser hostname and the Home Assistant Companion app. Keeping navigation in the current view preserves the app's authenticated route and avoids opening a separate browser context that may be blocked by Cloudflare.

Battery Health uses the controlled SmartFamilyOps transparent logo and the same compact brand-header treatment as Front Door Control. The app installs the logo under `/config/www/branding` so the dashboard remains available without an external image host.

The app reads Home Assistant's device, entity and area registries. Disabled registered entities are included as classification and automatic-candidate evidence without enabling them. Candidate edits participate in preview, validation, publication, backup and rollback with the rest of the catalogue.

## A Splunk and Cribl mental model

The Discovery Dashboard Builder can be explained as a small metadata pipeline for Home Assistant. The analogy is useful for Splunk talks because it follows the same shape as an ingest processor or Cribl pipeline:

| Pipeline stage | SmartFamilyOps behaviour | Splunk / Cribl analogy |
| --- | --- | --- |
| Source | Read Home Assistant device, entity, area and label registries. | Ingest source or incoming event stream. |
| Enrichment | Add manufacturer, area, entity names, device classes, availability evidence and stable registry IDs. | Field extraction and enrichment. |
| Classification | Apply ordered rules with deterministic `all` / `any` conditions and return function, reason and source role. | Eval, route and lookup logic. |
| Filter / route | Apply dashboard-specific automatic candidates, include/exclude decisions and duplicate handling. | Pipeline routing and stream selection. |
| Transform | Publish the installation-specific device catalogue Jinja output. | Event transformation into a useful downstream schema. |
| Dashboard output | Render a focused Home Assistant dashboard using the catalogue and live state lookups. | Search, dashboard or observability consumer. |

The important difference is timing. Splunk and Cribl usually transform events as they enter an analytics platform. This builder processes Home Assistant registry metadata into governed operational views, then reads live entity state when a dashboard renders. The classification rulebook is portable; the device catalogue is installation-specific; the dashboard is the presentation layer.

The talk-ready explanation is: **“We built a Cribl-style metadata pipeline for Home Assistant. It discovers the registry, enriches each device, classifies it deterministically, routes it into dashboard populations, publishes a compact catalogue and renders an operational view.”**

This model also defines a future extension path: expose the stages explicitly in the builder as **Source → Enrichment → Classification → Filter/Route → Dashboard output**, with a preview after each stage. That would make discovery logic easier to explain, test and govern without changing the two-template ownership model.

The reusable classifier and local device catalogue are deliberately separate. The classifier is portable SmartFamilyOps logic. The aggregate device catalogue contains installation-specific IDs and a separate evaluated membership list for every compatible dashboard. **Save as new dashboard** copies the source policy; later policy edits remain isolated. Users manage both through this app; neither generated Jinja file should be edited manually.

See the project README for the dashboard input contract and recovery procedure.
