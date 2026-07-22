# The Last 800 Meters — Optimized Submission

**Subtitle:** Restaurant Access and Delivery Infrastructure around Columbia University  
**Course:** Columbia GSAPP CDP — Geospatial Structures  
**Framework:** Mapbox GL JS 2.15.0  
**Author:** Yizhang Mu

## Research question

> How do distance, cuisine concentration, and the Broadway–Amsterdam street corridors structure potential last-mile food access to Columbia University?

The map treats restaurant supply, straight-line distance, approximate campus access points, and street-corridor proximity as spatial proxies. It does **not** claim to show platform service areas, real rider routes, delivery time, order demand, or worker behavior.

## What was optimized

### Reliability

- The NYC Open Data request now selects only the fields used by the map and requests a maximum of 5,000 rows rather than 50,000 full records.
- The Columbia context GeoJSON and restaurant data are loaded separately, so one network error does not immediately destroy the entire interface.
- When the live NYC API is unavailable, the map automatically loads `columbia_restaurants_fallback.geojson`.
- The fallback is explicitly labeled **OFFLINE FALLBACK** and contains approximate presentation points with inspection fields left blank.
- A full-screen error appears only when the required local GeoJSON files themselves cannot be loaded.

### Visual hierarchy

- The 800 m band is now the dominant orange line and visual focus.
- The 400 m and 1,200 m bands are lighter reference lines.
- The separate research-question card was merged into the title card to expose more map area.
- Inspection status was moved into an advanced disclosure panel.
- The top metrics now directly answer the spatial research question:
  - restaurants in view;
  - median campus distance;
  - cuisine groups represented.
- The legend, title, controls, and caption use a consistent editorial system based on Newsreader, Manrope, and DM Mono.

### Presentation mode

Use the **Presentation mode** button or press `P`.

Presentation mode:

- hides the control panel;
- simplifies the title card;
- preserves the legend and map evidence;
- flies to the campus view;
- is designed for the required submission screenshot.

Press `Esc` or click **Exit presentation** to return.

## Files

- `index.html` — one Mapbox canvas and all interface elements
- `style.css` — responsive editorial layout and presentation mode
- `mapBox_Sketch_03.js` — data loading, processing, Mapbox layers, filtering, metrics, popups, fallback logic
- `columbia_delivery_context.geojson` — approximate campus boundary, campus anchor, access points, Broadway and Amsterdam analytical corridors
- `columbia_restaurants_fallback.geojson` — local presentation fallback used only when the live API fails
- `SUBMISSION_CHECKLIST.md` — final publishing and screenshot steps

## Mapbox token

A public Mapbox token is already configured in `mapBox_Sketch_03.js`, so the site opens directly without a token-entry screen. The project uses only a client-side public token beginning with `pk.`; never replace it with a secret token beginning with `sk.`.


## Run locally

Open the **whole project folder** in VS Code and use **Open with Live Server**.

Alternative terminal command:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Do not double-click `index.html`; browsers can block local GeoJSON requests under `file://`.

## Recommended final screenshot

1. Confirm the source badge reads **LIVE NYC OPEN DATA** when possible. The fallback still keeps the project functional, but the live badge is preferable for submission.
2. Keep `All cuisines`, `0–800 m`, and `All locations` selected.
3. Use `Restaurant points`.
4. Click **Presentation mode**.
5. Click one restaurant near Broadway or Amsterdam to open its popup.
6. Capture the full browser viewport without the address bar if possible.

## Submission description

**The Last 800 Meters** uses Mapbox GL JS to examine restaurant access around Columbia University as part of a wider last-mile food infrastructure. NYC Department of Health restaurant records are reorganized into cuisine groups and compared through straight-line distance to campus. An emphasized 800-meter band frames the main analytical catchment, while Broadway and Amsterdam Avenue are treated as situated street corridors and approximate campus entrances identify destination thresholds.

The geospatial structure connects storefront locations to a broader socio-technical system. A food order depends not only on a restaurant and a customer, but also on digital platforms, payment systems, delivery workers, campus entrances, streets, curb conditions, and supply chains. The visualization makes one municipal data layer visible while also stating what the available dataset cannot show. Distance bands and corridor assignments are therefore presented as analytical proxies rather than real delivery zones or rider routes.

## Data limitations

- Straight-line distance is not street-network distance or delivery time.
- Corridor assignment is based on proximity to analytical linework.
- Campus boundary and access points are approximate.
- Restaurant inspection records are administrative records, not order or worker data.
- The local fallback is only a reliability and presentation layer; its point locations are approximate and its inspection fields are intentionally blank.
