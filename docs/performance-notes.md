# Performance measurements and follow-up

These are diagnostic observations, not a device benchmark or a promise of production latency.
Measured on 2026-10-29 with a fresh guest production Vite build served locally, headless Chromium
143.0.7499.0, a 1280×800 viewport and the sandbox's unthrottled CPU/network. No production service was
contacted. Values below are single runs and may vary substantially across machines and browsers.

- The guest build reported 536.21 kB JavaScript (165.21 kB gzip) and 64.71 kB CSS (13.26 kB gzip).
  Vite warned that the JavaScript chunk exceeds 500 kB. The previous audit's guest build reported
  472.57 kB JS / 145.48 kB gzip; this is a different build, not a controlled before/after benchmark.
  The routing change needed for history-aware draft blocking contributes to the larger bundle. A
  later build after the additional coordination and draft-safety fixes reported 541.46 kB JS /
  166.94 kB gzip (CSS unchanged); the browser observations below were made on the earlier measured
  build, not re-benchmarked on that later build.
- With an ordinary fresh browser context, opening the home page and waiting 2.5 seconds requested all
  15 guitar recordings: 3,150,652 encoded body bytes and 3,155,152 resource-timing transfer bytes from
  this local preview. Actual production transfer, caching and compression were not measured. With a
  mocked `slow-2g` Network Information value and no Save-Data flag, the same observation requested
  **zero** recordings in that period. `2g` and Save-Data also skip prefetch; recordings are still
  loaded on demand. Browsers without that API cannot provide this signal.
- On `/chords/C/major?tuning=8-string-standard`, then expanding the fret window to 24, maximum stretch
  to 5 and muted strings to 4, and sorting by estimated ease, the browser's Long Tasks observer recorded
  tasks of 67, 75, 139, 224 and 252 ms over the page/control sequence. The resulting view reported
  17,729 shapes. These are individual main-thread tasks, not total search time or a statistically
  representative result. Action wall times included an intentional 300 ms observation pause and are
  not interaction-latency measurements. The earlier audit saw roughly 300–534 ms in a different
  eight-string sequence; the two runs are not directly comparable.

The narrow `slow-2g` prefetch correction is covered by tests. No worker, search rewrite, broad lazy
loading or sound-bank redesign is being introduced solely on these samples: those decisions need a
agreed latency/data budget and representative devices. Next measure repeated cold/warm runs on a
mid-range phone and desktop, with realistic network conditions and the same chord/control sequence;
record interaction latency, long tasks, memory, bytes and first-play audio delay. Compare worker or
chunking prototypes only after preserving ordering, search completeness limits, audio and offline
behavior in regression tests.
