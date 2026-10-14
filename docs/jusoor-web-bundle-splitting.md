# Jusoor web bundle split

Production builds before and after route-level lazy loading were compared with
Vite. Sizes below are minified JavaScript output sizes; gzip values are Vite's
reported sizes.

| Bundle | Before | After |
| --- | ---: | ---: |
| Main entry | 2,630.08 kB (702.14 kB gzip) | 787.11 kB (218.20 kB gzip) |
| Main stylesheet | 338.73 kB (57.70 kB gzip) | 194.33 kB (34.15 kB gzip) |

The main JavaScript entry is about 70% smaller, and its gzip size is about 69%
smaller. The largest contributors in the original entry were eagerly imported
route modules: program analytics and its Recharts charts, the application and
participant-learning surfaces, course package playback using `scorm-again`,
and certificate generation using `html2canvas` and `jspdf`.

Those features now load on demand. After splitting, their largest separate
JavaScript outputs were:

| Deferred feature bundle | Minified | Gzip |
| --- | ---: | ---: |
| Program analytics | 470.06 kB | 126.69 kB |
| Course package player | 393.95 kB | 86.88 kB |
| Certificate PDF (`jspdf`) | 386.19 kB | 124.99 kB |
| Certificate rendering (`html2canvas`) | 201.04 kB | 47.07 kB |
| Application and participant surfaces | 153.46 kB | 40.76 kB |
| Learning progress and verification | 68.59 kB | 20.69 kB |

The certificate PDF libraries are requested only when a certificate download
starts. The SCORM player is requested only when a participant opens a SCORM or
xAPI package. Existing Wouter paths and role checks remain in place.

The production build succeeds. Vite still reports that the 787.11 kB entry
exceeds its 500 kB warning threshold; most infrequently used feature code is
now in separate downloads, but further splitting of the remaining workspace
entry could reduce it further.
