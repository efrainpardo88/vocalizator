# Vocal Lines

Vocal exercise patterns that transpose themselves across your range. Pick a pattern, mark
your range, and the piano climbs a semitone on every pass while you just sing.

Vite + React + Tone.js. No backend, no environment variables.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to Vercel

**Option A — CLI**

```bash
npm i -g vercel
vercel login
vercel --prod
```

Vercel detects Vite on its own. If it asks:

- Framework preset: **Vite**
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

**Option B — from GitHub**

```bash
git init
git add .
git commit -m "Vocal Lines"
git remote add origin git@github.com:YOUR_USERNAME/vocal-lines.git
git push -u origin main
```

Then on vercel.com: *Add New → Project → Import*. Every push to `main` redeploys.

## Notes

- The microphone needs HTTPS. `localhost` counts in development; Vercel provides it in
  production.
- Preferences (range, tempo, pattern, note naming) live in `localStorage`.
- The manifest and icons are included, so "Add to Home Screen" gives you a full-screen app
  on a phone.
- On iOS Safari audio only starts after a user gesture, which is why the **Start** button
  is what opens the `AudioContext`. Do not move that into an effect.

## Files

```
index.html              fonts, manifest, PWA meta
src/main.jsx            entry point
src/VocalLines.jsx      component: scheduler, tuner, UI
src/patterns.js         exercise library, voice types, playback modes
src/pitch.js            note math and autocorrelation pitch detection
src/styles.css          stylesheet
public/manifest.webmanifest
public/icon-192.png, icon-512.png
```

## Adding patterns

In `src/patterns.js`, the `PATTERN_LIBRARY` array. `degrees` holds semitone offsets from
the tonic:

```js
{ id: 'my-pattern', category: 'Scales', name: 'My pattern',
  degrees: [0, 2, 4, 5, 7, 5, 4, 2, 0], syllable: 'nay' }
```

`beats` is optional and parallel to `degrees`. It sets how long each note lasts, so a
sustained note is one long note rather than several attacks:

```js
{ id: 'held-fifth', category: 'Sustains', name: 'Held fifth',
  degrees: [0, 2, 4, 5, 7, 5, 4, 2, 0],
  beats:   [1, 1, 1, 1, 5, 1, 1, 1, 1], syllable: 'nay' }
```

A new `category` value shows up in the filters by itself — `PATTERN_CATEGORIES` is derived
from the array.

From the interface, the same thing is the `7x5` syntax in the custom pattern field.
