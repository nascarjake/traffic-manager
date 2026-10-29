# MUNICIPAL — Traffic Control Simulator

A playable browser-based WebGL traffic game with a late-1990s municipal workstation interface. JavaScript modules and locally bundled Three.js; no build dependencies, credentials, cloud account, or npm install required.

## Run

Node 20+ and Python 3 are sufficient:

```sh
cd municipal
npm run dev
```

Open http://127.0.0.1:5173. `npm run build` creates a self-contained static `dist/` for any static host. Internet is needed only for finding/importing additional districts and opening source links; the bundled Wicker Park scene and simulation work without external network requests.

## Play

Select a junction, adjust fixed-time phases or switch to detector-actuated control, and apply the plan. Clearances are preserved. Use Road works to convert signal/stop control, add lanes, and install a left-turn bay within a $50,000 budget. Test your plan compares two seeded four-minute runs and awards the assignment at 20% lower delay with no fewer completed trips. Space pauses; 1/2/3 switch inspector tools; R runs a comparison; Enter applies a signal plan. Drag orbits, right-drag pans, and scroll zooms. PLAN switches to overhead view.

District manager supports explicit place searches through Nominatim, coordinate entry, a map preview of a 600 m or 900 m square, and direct OSM geometry imports. If a public service fails, the current district remains intact. Save plan stores the district, plans, imported counts, and road edits on the current browser; browser storage is not cross-device sync.

## Data and fidelity

The bundled Wicker Park extract includes 2,299 building footprints and a connected road graph simplified into 131 road links and 65 branching junctions. Original OSM IDs, names, one-way access, and relevant tags remain in the extract. Nearby branching nodes connected within 23 m are contracted into a single control area, including the North/Damen/Milwaukee junction. A named street and its opposing approach share a phase. Signal placement is inferred from road class when mapped signal data does not identify a junction. Heights without mapped values are procedural estimates.

Chicago's Average Daily Traffic Counts (`gc7y-n4xa`) supply 80 nearby dated observations. Each link can match a same-name count within 450 m. The most recent observation at a location is preferred, and unique camera-segment IDs prevent repeated observations from multiplying district intensity. These are camera-derived directional daily counts, not live traffic or turning-movement measurements. An assumed 8% peak-hour fraction and five equivalent entering streams establish a bounded district departure rate. Boundary approaches are weighted by observed volume or estimated road-class volume. Housing and mapped shops/amenities weight local trip endpoints. Morning/evening trip purpose and the midday factor are modeled. CSV imports use the schema displayed in the Data inspector and are labeled unverified.

Cars use directed shortest paths, acceleration, following gaps, lane assignment, stop-line queues, and downstream-space checks. Once granted entry they commit to clearing the junction. Simplified reservations serialize junction entry. Left-turn bays separate turning demand from through movements. Actuated controls implement minimum green, passage gap, gap-out, opposing-call maximum timers, max-out, and resting green. Fixed controllers support cycle offsets. Every phase includes 3 s yellow and 2 s all-red. These are teaching defaults, not site-specific engineered intervals.

The matched comparison starts both simulations from empty at the same clock, with the same seeded departure requests, destinations and routes. Original lane counts and default controllers form the baseline; edits form the candidate. Queued departures outside the map and unfinished trips contribute to total delay. Delay is total accumulated speed-loss time plus entry wait divided by requested trips, so it is not a completed-trip-only statistic. The live scene begins with a 40-second warmup; matched tests are separate, fresh runs.

This prototype excludes pedestrians, transit priority, parking, lane changes mid-link, detailed conflict paths, grades, measured turning proportions, and signal warrant analysis. It is an educational game, not calibrated or validated for engineering recommendations. Satellite imagery, terrain elevation, and photogrammetric 3D tiles are **not integrated**. The real-world 3D view extrudes OSM footprints.

## Research and next steps

- [FHWA Traffic Signal Timing Manual, Chapter 5](https://ops.fhwa.dot.gov/publications/fhwahop08024/chapter5.htm) informs controller timing concepts.
- [Chicago counts](https://data.cityofchicago.org/d/gc7y-n4xa) provide the bundled observed demand source. Outside Chicago, use a local agency's compatible CSV until other adapters are implemented.
- [Cesium content usage and attribution](https://cesium.com/learn/ion/content-usage-and-attribution-guide/) and [Google Map Tiles policies](https://developers.google.com/maps/documentation/tile/policies) were reviewed for photogrammetric rendering. A future optional Cesium/3D Tiles viewer needs suitable credentials, billing configuration, dynamic provider attribution, and review of overlay/content restrictions. It should remain a visual backdrop to editable vector road geometry.
- Stronger simulation fidelity would require measured intersection turning counts, pedestrian phases, calibrated saturation flow, explicit conflict paths, lane-changing, real signal plans and comparison against observed travel times. NEMA dual-ring/barrier operation and protected/permissive left-turn phases are not implemented.

## Verification and credits

```sh
npm test
npm run credits:check
npm run build
```

Tests cover phase safety, actuated detection and opposing-call timers, coordination offsets, safe plan transitions, one-way routing, real-map contraction, identical baseline scores, matched seeded demand after edits, finite vehicle states, accounting for unfinished demand, and clearing a stop junction without repeated stopping.

`credits.json` is the canonical current/historical asset list. The in-game About screen reads it directly. License/provenance evidence is in `licenses/`; the credits check validates all data/vendor files and SHA-256 hashes. Keep historical entries when replacing an asset. Original procedural visuals need no external assets. Chicago's standalone license/version is unspecified in retrieved metadata; portal terms and the unresolved fact are retained in provenance rather than invented.
