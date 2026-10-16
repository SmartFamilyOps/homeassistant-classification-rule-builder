# Battery Health dashboard

`card.jinja` is the source-controlled Markdown/Jinja card used by the Home Assistant Battery Health dashboard.

The app provisions a missing dashboard with the sidebar title **Battery Health**
and the `mdi:battery-sync` icon. It preserves an existing dashboard during
restarts and upgrades.

The card discovers battery sensor candidates at runtime, passes device and registered-entity evidence to the managed classifier, and honours the classifier's `battery_health` and `source_role` outputs. The `battery_monitor` Home Assistant label remains an explicit inclusion override; `battery_ignore` remains an explicit exclusion when no monitor override is present.

The rendered table places Home Assistant availability immediately after the row number and uses hover titles to identify source entities or calculated/registry-derived content. Splunk **Configure** links open the local onboarding prototype in a new browser tab so Home Assistant's dashboard router cannot reinterpret the `/local/` URL.

The canonical SmartFamilyOps route is:

```text
/smartfamilyops-dashboards/battery-health
```

Home Assistant exposes one dashboard path and one view path, so this two-level
route uses the dashboard URL key as the SmartFamilyOps namespace and the view
path as the branded dashboard name. Home Assistant requires the dashboard URL
key to contain a hyphen and rejects uppercase characters, so a first segment of
exactly `SmartFamilyOps` is not valid. Home Assistant does not implement nested
dashboard folders; the two router segments provide the intended organisation.

The previous `/battery-health/battery-health` route may be retained temporarily
as a compatibility copy during migration. Back up the applicable Lovelace
storage document before replacing card content.
