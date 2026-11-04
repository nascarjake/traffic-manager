# Web optimization measurements · 2026-11-04

Baseline: commit 1a1e456 (v0.9.0). Optimized: v0.10.0. All measurements use the bundled public Wicker Park district, not a user's location.

## Repeatable CPU geometry benchmark

Three alternating fresh Node processes per version; medians below. Node v20.18.0 on the development host. Both build 2,299 building footprints, the same scenery and eight detailed chunks, plus the same 6,000-capacity moving fleet. Canvas texture generation, GPU compilation, actual rendering, roads/signs and networking are excluded. `scripts/bench-render.mjs` is the repeatable optimized benchmark; baseline source was copied from 1a1e456 into a temporary checkout. Full samples: geometry.json. Geometry metrics count unique resources, including hidden LOD resources; mesh batches count visible geometry before camera-frustum culling. Typed-buffer bytes are retained attribute/index/instance arrays, not total JavaScript heap or GPU VRAM.

| Metric | Before | After |
|---|---:|---:|
| Geometry construction median | 427.8 ms | 315.5 ms |
| Unique geometries | 610 | 214 |
| Unique materials | 610 | 210 |
| Typed-buffer bytes | 24,913,698 | 14,554,661 |
| Static scene mesh batches | 537 | 350 |

The unchanged road graph construction varied from 81.7 ms to 92.9 ms; that variation is measurement noise, not a claimed improvement. Geometry CPU construction improved by about 26%, retained buffers by about 42%, and batches by about 35% in this fixture.

## JavaScript startup payload

The old static import graph was collected recursively from the two entry points at the baseline commit, excluding dynamic Leaflet. The new sizes come from esbuild's output files. gzip figures compress each resource independently; actual transfer depends on hosting, browser cache and compression. CSS and map JSON are not included. Full data: javascript.json.

| Metric | Before | After |
|---|---:|---:|
| Initial JS modules | 34 | 3 |
| Raw JS bytes | 2,422,483 | 803,451 |
| gzip bytes | 519,422 | 227,051 |

No cold-network wall-clock speedup is claimed. The shared early-location module is preserved as one ESM instance. District-picker JS and CSS remain lazy.

## Browser observations and limits

Chrome DevTools MCP was unavailable. Browser validation used the game's DOM telemetry and screenshots through the supported browser tools. Public demo counters are retained in browser-before.json and browser-after.json. The baseline captured a single frame; the improved counters average 60 frames and also report peaks. They are not an apples-to-apples timing benchmark: traffic populations differ and browser/GPU contention varies. The baseline observation was 968 calls / 1.92M triangles; the optimized capture averaged 518 calls / 0.89M triangles with a 788-call peak. Render time is CPU submission time, not GPU elapsed time, and FPS is deliberately not used to claim a speedup.

The shadow target is 2048² versus 4096² (75% fewer texels), with redraws on actual simulation/camera/scenery changes. Full near tree detail, all buildings, road geometry, vehicle logic, light outputs, matching seeds and queue metrics remain. Distant foliage uses lighter geometry; parked vehicle parts share a material while moving cars retain their detailed material and light behavior.

Validation includes shader/color inspection, a district reload, lazy Leaflet map/CSS, a road widening rebuild, protected signal outputs, a traffic wave and the original-versus-draft test. Shared geometry disposal, quantized normal/color precision, HDR color preservation, bounded instance uploads, parked-car batching and foliage LOD color/transform sharing have automated tests.

Primary references: [Three.js BufferAttribute](https://threejs.org/docs/pages/BufferAttribute.html), [esbuild API](https://esbuild.github.io/api/). Licenses and provenance remain in the canonical credits.
