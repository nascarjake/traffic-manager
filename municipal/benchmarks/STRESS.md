# 2.7 km district stress test — 2026-11-04

The downloaded Wicker Park fixture covers a real 2.7 × 2.7 km district: 142,002 OSM elements, 16,551 buildings, 954 road links, 454 intersections and 16,605 trip origins. Nine bounded OSM map requests and the Chicago traffic-count query completed in 7.24 seconds in one Node fetch; this is a single network observation, not a cold-browser load guarantee. The retained result records the dataset SHA-256, bounds, source and acquisition date. The 29 MB raw fixture stays in `/tmp`, outside the game bundle.

## Sustained rush and retained memory

`stress-cpu-after.json` records 30 simulated minutes at evening rush demand 2.5×, seed 418, with 0.1-second steps, followed by eight 120-car waves. Node v20.18.0 used explicit GC at checkpoints. The final CPU run followed the five-minute browser measurement, with a paused browser scene still rendering and brief supplementary UI checks. It averaged 14.02 ms per 0.1-second simulation step (p95 20.56 ms, p99 28.79 ms); this is CPU simulation cost, not browser FPS or a standalone engine speedup claim.

| Simulated minute | Road cars | Routed entries | Counted upstream demand | Route cache | Retained JS heap (MB) |
|---|---:|---:|---:|---:|---:|
| 5 | 1,769 | 4,231 | 714 | 4,096 | 142.9 |
| 10 | 2,127 | 3,873 | 8,059 | 4,096 | 143.6 |
| 15 | 2,360 | 3,640 | 15,380 | 4,096 | 144.4 |
| 20 | 2,527 | 3,473 | 22,714 | 4,096 | 144.9 |
| 25 | 2,685 | 3,315 | 30,107 | 4,096 | 145.5 |
| 30 | 2,739 | 3,261 | 37,484 | 4,096 | 145.6 |

MB is decimal. The last five minutes added 0.1 MB despite another 7,369 upstream requests. After releasing the rush simulation, retained heap was 121.740 MB; after eight wave allocation/release cycles it was 121.808 MB, a 0.068 MB difference. This supports bounded retention in the measured session, not a proof of zero leaks on all browsers or infinite runtime. Geometry arrays and browser heap telemetry measure different memory and must not be added together as process RAM or VRAM.

The overload policy retains at most 6,000 routed car requests. Additional departures accumulate per source as counts and request-time sums; round-robin dispatch assigns their destinations when slots free. Their counts and waiting time remain in queue and delay metrics. Request conservation (`generated = completed + road cars + routed entries + upstream`) was checked at every checkpoint. At 30 minutes all 45,026 requests were accounted for. Upstream departure time uses a source mean, so individual upstream ordering and routes are approximations under saturation. This does not change isolated matched waves below capacity. Pedestrian overload has an analogous 4,000-body limit with per-junction waiting groups and explicit accounting regression tests.

The selected six-arm signal is a difficult throughput test: all eight unchanged 120-car waves completed 15 trips at the 180-second limit. They did **not** clear the whole wave. Performance improvements do not award a traffic improvement or discard the remaining cars.

## Browser camera and live-timing soak

The localhost-only `?stress=1` lab runs five wall-clock minutes: one minute of rush traffic, three one-minute 120-car waves at 3× simulation speed, then a final rush minute restoring the saved ambient population. A continuous repeated 600 m camera sweep also rotates and zooms, churns streamed building chunks, keeps the timing editor and live outputs open, and adjusts green time every 15 seconds through the normal validated/safe-clearance path. The wave isolates and pauses ambient traffic, matching the cabinet's existing behavior; it is not 120 cars added on top of rush traffic.

Baseline results are retained in `stress-browser-before.json`. An intermediate run while the CPU soak competed for resources regressed despite fewer draw calls, demonstrating why average FPS alone was not accepted. The final run is recorded separately. Frame intervals include CPU, scheduling and GPU contention; CPU frame work is not GPU elapsed time. The first phase includes a district-construction interval. Browser heap samples are not forced-GC retained sizes. The legacy counter can also include multiple pages sharing one heap, so it is not used as proof of browser-process memory stability; see the [Chrome team’s memory measurement guidance](https://web.dev/articles/monitor-total-page-memory-usage). Dedicated DevTools heap/GPU tracing was unavailable in this environment. The map, camera path and traffic settings are repeatable, but runs are sequential and system contention is uncontrolled, so these are observations rather than a laboratory speedup claim.

The final complete build (`main-AWKKQ4ML.js`) completed all five stages, with 20 live timing writes and no captured console errors:

| Segment | Baseline FPS | Final FPS | Final frame interval p95 | Final frames over 50 ms |
|---|---:|---:|---:|---:|
| Rush + camera / timing | 48.7 | 73.3 | 25.0 ms | 27 |
| 120-car wave 1 | 58.2 | 84.5 | 25.0 ms | 19 |
| 120-car wave 2 / wide view | 42.5 | 61.7 | 33.5 ms | 25 |
| 120-car wave 3 | 49.7 | 92.1 | 17.5 ms | 14 |
| Restored rush + camera / timing | 33.5 | 70.6 | 25.5 ms | 36 |

These are per-segment averages, not minimum FPS or a locked-60 guarantee. Occasional frames still exceed 50 ms, particularly when building chunks stream in wide views. The final rush segment ended with 1,334 road cars and 2,319 entry requests; the faster result is not a smaller ambient fleet. All three wave runs dispatched 120 and completed 15 trips in approximately 180 simulated seconds, matching the difficult baseline junction's throughput.

After the first 10 seconds, scene geometry arrays ranged from 61.98 to 83.15 MB as the camera moved. Detail retention never exceeded 36 chunks. Texture count warmed from 22 to 30 and stayed at 30; the final scene retained 65.61 MB of arrays with 14 detailed chunks. GPU geometry counters warmed as previously unseen signs/buildings uploaded, then fluctuated with chunk eviction, rather than being interpreted as a leak solely from the initial climb.

Legacy browser heap samples fluctuated from 587.93 to 717.15 MB and ended at 622.59 MB, below the first sample of 695.05 MB. Their absolute values include unforced-GC/shared-heap effects; the stronger retention evidence is the explicit-GC CPU test and bounded resource/accounting checks, not a claim that the browser uses 146 MB total.

Direct UI verification also used the actual +5 button: the target changed immediately, the row showed LIVE 23s → 28s, and the cabinet reported QUEUED · SAFE CLEARANCE during a running 120-car wave. The queued edit subsequently became ACTIVE with LIVE 28s. A new wave initialized with its edited timing. A separate combined case (recorded in `stress-browser-combined.json`) injects 120 cars into the ambient rush simulation without setting drill mode, while retaining the same camera sweep and timing writes. It reserves future departure IDs and checks available capacity; the normal cabinet and matched comparisons retain their isolated-wave behavior. This preserves the controller's safety transition rather than instantly changing live right-of-way.

## Fixes and regression coverage

- Blocked requests no longer allocate full transient vehicles every simulation tick; entry lanes are reused until road works change them.
- Turn classification and lane eligibility cache against graph-owned weak keys; tag/lane/work changes invalidate eligibility. Weighted prefix tables avoid scanning every mapped building for each departure.
- Route LRU: 4,096 entries. Detailed building retention: 36 chunks, evicting far detail while preserving footprint meshes.
- Stop/yield parts batch into one pickable colored mesh per junction. Pedestrian signal faces share one mesh per junction.
- Far tree clusters use 20-triangle foliage. Shadows concentrate on a maximum 700 m half-span, avoid orbit-only redraws, and refresh at most 20 Hz during motion; crossing and light simulation keep their normal rate.
- Camera frustum culling skips uploads for off-screen pedestrians. Their crossing simulation continues.
- Regression coverage exercises cache eviction, telemetry bounds, weighted destination sampling, lane-work invalidation, car/pedestrian overload accounting and fair release, detail eviction, sign batching/picking and pedestrian culling. The complete simulation, movement, safety and matched-wave suite remains required.

## Simultaneous rush + 120-car injection

`stress-browser-combined.json` records a separate 60-second test after closing the extra public-verification game tab. The district warmed for 75 simulated seconds at rush demand 2.5×, then 120 trips were injected into that same simulation; ambient demand kept running, camera motion continued, and four green-time edits used safe controller clearance. Average frame rate was 72.8 FPS, frame interval p95 25.0 ms and p99 33.5 ms, with four frames above 50 ms and no captured console errors.

The first checkpoint had 726 road cars and 1,026 entries; the final checkpoint had 1,175 road cars and 1,912 entries. Including completed trips, total requests increased from 1,753 to 3,113, confirming ongoing background departures. The final scene retained 65.61 MB of geometry arrays and 30 textures. Legacy JS heap decreased from 287.71 to 191.25 MB across the minute; its absolute scope still has the limitations described above.

An exploratory combined run while another game tab rendered averaged 48 FPS. Closing that verification tab and rerunning produced the result above, despite the stronger rush warm-up. This is evidence that the app meets the measured single-game case, not a promise that it can hold the same rate with competing WebGL applications or on every GPU. The additive case is local stress instrumentation; the regular cabinet wave remains an isolated, repeatable timing test.
