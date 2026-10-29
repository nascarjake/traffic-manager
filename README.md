# MUNICIPAL — Traffic Control Simulator

A traffic engineering game for the neighborhoods you know. Take charge of a real-world map, tune the signals and reshape intersections to keep the evening commute moving.

![MUNICIPAL cover art](municipal/public/art/municipal-cover.webp)

## Features

- Search OpenStreetMap for a neighborhood and turn its roads and building footprints into a 3D district.
- Reprogram fixed-time and detector-actuated signals, with yellow and all-red clearance.
- Convert signals and all-way stops, widen approaches, and add left-turn bays within a public works budget.
- Compare your design against the original in matched, seeded traffic simulations.
- Play a Chicago scenario informed by dated city traffic counts, or import compatible local counts from CSV.
- Learn how green times, detector gaps, queues and coordination interact in the built-in field manual.

[Play MUNICIPAL](https://nascarjake.github.io/traffic-manager/)

The traffic model combines observed counts where available with estimated trip patterns. It is an educational game and is not validated for real-world engineering decisions. Satellite imagery and photogrammetric tiles are not currently integrated.

## Run locally

Node 20+ and Python 3 are sufficient; no dependency installation is required.

```sh
cd municipal
npm run dev
```

Open http://127.0.0.1:5173. See [the technical README](municipal/README.md) for controls, data sources, simulation assumptions, asset provenance, and tests.
