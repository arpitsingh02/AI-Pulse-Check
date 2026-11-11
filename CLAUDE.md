# Pulse — working notes

A personal news reader tracking innovation, fintech, and deep tech AI. Runs as a
Vite/React web app in development, packaged to an Android APK via Capacitor.

**Current work:**
- `BRIEF-MODE.md` — the scrollable feed feature. Build this first.
- `DESIGN.md` — visual refresh. Build this after Brief mode works.
- `TUNING.md` — how to tune the condense algorithm.
- `tune.mjs` — working reference implementation. Port weights from here.

## Owner context

The owner is comfortable following setup steps but is not a daily coder. So:

- Explain what changed and why, in plain terms, after each step
- Prefer boring, readable code over clever code
- When something can't work, say so directly rather than building a fragile
  workaround
- Don't add dependencies without saying what they're for

## Architecture

```
src/
  App.jsx            screen, filtering, day grouping, mode switching
  styles.css         all styling — no CSS modules, no Tailwind
  lib/feeds.js       fetching + RSS/Atom/RDF parsing
  lib/topics.js      topic classification and ranking
  lib/storage.js     feed list, read state, prefs (localStorage)
vite.config.js       dev-only feed proxy at /__feed
```

## The one thing to understand

Feeds don't send CORS headers, so browsers refuse to read them. Two transports
solve this and both already exist:

- **Dev:** middleware at `/__feed` in `vite.config.js`, server-side, dev only
- **Android:** `CapacitorHttp` uses the native HTTP stack, where CORS doesn't apply

`src/lib/feeds.js` picks between them via `Capacitor.isNativePlatform()`. **Any
new outbound request must reuse this pattern.** Writing a bare `fetch()` will
work in dev and fail silently in the APK.

## Conventions

- Plain React with hooks. No Redux, no router, no component library.
- Styling in `styles.css` using the CSS variables in `:root`. Never hardcode a
  color or a font size — add a token. See `DESIGN.md` §1.5–1.7 for the scales.
- `DESIGN.md` §1.10 lists design choices that are out of bounds. Read it before writing CSS.
- Classify and rank in `useMemo`, keyed to the fetch, not per render.
- Comments explain *why*, not *what*. Existing comments show the register.
- Storage keys are versioned (`pulse.v3`). Bump on shape change and migrate
  read state forward — don't drop it.

## Verifying changes

There is no test suite. Verification is manual:

1. `npm run dev`, check the browser, watch the console for errors
2. For `topics.js` changes, write a scratch script that runs `pickTop()` against
   fake headlines and check the ordering is sane — cheaper than clicking through
3. For `condense.js` changes, run `node tune.mjs --feed <url> --verbose`. See
   `TUNING.md`.
3. Narrow the viewport to 360px before calling anything done
4. Before an APK build, confirm no bare `fetch()` calls were introduced

## Gotchas

- `npm audit` reports vulnerabilities in `esbuild` (dev server) and `tar`
  (Capacitor CLI). Both are build-time only. **Never run `npm audit fix --force`**
  — it breaks the project. Upgrade deliberately, one package at a time.
- Google Fonts load over the network, so titles fall back to system faces
  offline. Bundling them is a known future task.
- CB Insights' feed URL (`cbinsights.com/research/feed/`) is unverified. If it
  errors, it likely doesn't exist and needs an email-to-RSS bridge instead.
- PitchBook has no feed and cannot be added. Don't try.
- Windows dev machine. `npm run apk` uses `gradlew.bat`. The Android build needs
  `JAVA_HOME` on **JDK 17** (not Android Studio's bundled JDK 25 — Gradle can't
  read its class files) and `android/local.properties` containing `sdk.dir`.
- **No paid APIs.** Summarization is local and extractive (`condense.js`). Do not
  introduce an LLM call, an API key, or any metered service without asking first.
