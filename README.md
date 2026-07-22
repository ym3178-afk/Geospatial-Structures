# The Last 800 Meters

**Subtitle:** Restaurant Access and Delivery Infrastructure around Columbia University  
**Course:** Columbia GSAPP CDP — Geospatial Structures  
**Framework:** Mapbox GL JS 2.15.0  
**Author:** Yizhang Mu

## Research question

> How do distance, cuisine concentration, and the Broadway–Amsterdam street corridors structure potential last-mile food access to Columbia University?

The project deliberately avoids claiming that restaurant locations equal actual delivery activity. Instead, it uses restaurant supply, straight-line distance, approximate campus access points, and street-corridor proximity as spatial proxies for discussing the incomplete infrastructure behind food delivery.

## Why this is a geospatial structure

A food order appears to be a simple transaction, but it depends on several connected systems: restaurant storefronts, digital platforms, riders, campus entrances, streets, payment processors, regional warehouses, and agricultural supply chains. The map begins with the local spatial layer and makes its assumptions visible.

## Data sources

### NYC restaurant GeoJSON

The project loads the **DOHMH New York City Restaurant Inspection Results** dataset directly from NYC Open Data:

```text
https://data.cityofnewyork.us/resource/43nn-pn8j.geojson
```

The request is restricted to ZIP codes 10025, 10026, 10027, and 10031 and ordered by inspection date. JavaScript then:

1. rebuilds Point geometry from longitude and latitude;
2. keeps restaurants within 1,800 meters of the Columbia anchor;
3. keeps the newest record for each CAMIS restaurant ID;
4. classifies cuisine into six readable groups;
5. calculates straight-line campus distance;
6. assigns the nearest approximate campus access point;
7. assigns a Broadway, Amsterdam Avenue, or cross-street corridor proxy.

### Situated context GeoJSON

`columbia_delivery_context.geojson` contains:

- an approximate campus boundary;
- a Columbia campus anchor;
- six approximate campus access points;
- Broadway and Amsterdam Avenue analytical corridors.

These features were created for the visualization. They are not official campus GIS data, official curb zones, platform service areas, or observed rider routes.

## Visual and interactive system

- one Mapbox canvas;
- cuisine-based color system;
- distance-based point size;
- 400 m, 800 m, and 1,200 m analytical bands;
- point and density-field display modes;
- filters for cuisine, distance, inspection status, and street context;
- dynamic visible-data metrics;
- popups with restaurant, inspection, access-point, and corridor information;
- campus and district camera views;
- export of the currently visible records as GeoJSON.

## Mapbox token

Open `mapBox_Sketch_03.js` and replace:

```js
const MAPBOX_TOKEN = "PASTE_YOUR_PUBLIC_MAPBOX_TOKEN_HERE";
```

with your complete public token beginning with `pk.`.

The on-page token form is only for local testing. The token must be included in the JavaScript before publishing so the instructor can open the GitHub Pages link.

## Run locally

Use VS Code **Live Server**, or run:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Submission description

**The Last 800 Meters** maps restaurant access around Columbia University using NYC Department of Health restaurant-inspection records. Restaurants are deduplicated by permit ID, grouped by cuisine, and compared through straight-line distance to campus. Broadway and Amsterdam Avenue are treated as analytical corridors, while approximate campus access points provide a more situated destination context. Users can switch between restaurant points and a density field, filter the data, inspect individual records, and export the current selection as GeoJSON.

The project uses geospatial structure to examine food delivery as an incomplete infrastructure rather than a frictionless app service. Restaurant locations reveal only one visible layer. Actual delivery also depends on platform rules, riders, curb access, campus entrances, payment systems, and supply chains that the public dataset does not contain. By showing both the spatial evidence and its limitations, the map asks what becomes visible through municipal data—and what remains outside the map.

## Limitations

- distance is straight-line distance, not a street-network route or delivery-time estimate;
- corridor assignment is based on proximity to analytical linework;
- campus access points and boundary are approximate;
- restaurant-inspection records are administrative records, not order-volume data;
- missing grades do not necessarily indicate poor conditions;
- the public dataset changes over time, so visible counts may change.
