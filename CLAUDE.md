# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Vocal Lines is a single-page vocal practice tool. The user picks an exercise pattern and a
vocal range; the app plays the pattern, transposes it by a fixed interval on every pass,
and optionally listens through the microphone to show how far off pitch the singer is.

Vite + React 18 + Tone.js on the client, playing and listening entirely in the browser.
The next phase adds accounts, cloud sync and scoring, which need a backend; the specific
architecture — hosting, API shape, database — is an open decision tracked in issue #4, not
decided by this document. Until #4 lands, treat backend specifics as undecided rather than
assumed, and do not guess at them.

## The brief it was built against

These are the constraints that produced the current design. When a decision is technically
open, resolve it against this, not against what is easiest to build.

**The user cannot play piano well enough to run their own exercises.** That is the whole
reason the app exists. Anything that assumes keyboard skill — asking for a starting chord,
a MIDI device, notation input — defeats the purpose. Tapping Start has to be enough.

**The model is handwriting drills.** Copying the same line over and over until it is
automatic, which is what `repeatsPerRoot` and the automatic transposition are for. Volume
of repetition is the feature, not a side effect.

**The pattern bank should be large and varied on purpose.** The stated need was to get out
of the same major scale every time: pentatonics, modes, arpeggios, chromatics, sustains.
When in doubt, add patterns. The custom field exists so the library is never the ceiling.

**Pitch accuracy is the goal, not warm-up convenience.** This is why Echo and Reference
modes exist: Guide mode drags the singer along and hides intonation problems. Anything that
makes it easier to sing along without being accurate is working against the point.

Two things follow from this that are easy to get backwards. Features that add polish but
remove repetition or remove the singer's exposure are a downgrade. And a bigger, stranger
pattern library is more valuable here than a prettier interface.

**None of this is superseded by accounts, cloud sync or scoring.** Those are additions on
top of the practice loop, not a replacement for it. "Tapping Start has to be enough" still
holds: a sign-in step, a saved study plan or a synced score must never be a precondition
for running an exercise. "Volume of repetition is the feature" still holds too: a login
flow that gets between the singer and Start, or a sync step that eats into how many
repeats happen in a session, is a downgrade no matter what it adds elsewhere.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-free build into dist/
npm run preview    # serve the built output
npm test           # Vitest, one run
npm run test:watch # Vitest, re-running as you edit
```

There is no linter configured. `npm test` and `npm run build` are the automated checks
that exist — run both before reporting any code change as done.

The tests cover the pure modules only: `pitch.js` and `patterns.js`. Nothing exercises
the component or Tone.js, so anything touching audio, scheduling or the microphone is
still verified by ear on a real device. The iOS silence bug passed the build untouched;
assume the same of any audio regression.

## How changes reach production

`main` deploys to production on every push, through Vercel's git integration. Other
branches get their own preview deployment, which is the only way to try a change on a
phone before it is live — use it for anything touching audio.

`main` is protected: changes go through a pull request with one approving review and a
green `test` check, and force pushes and deletions are refused outright. Repository
admins are exempt, deliberately, so that the owner is never locked out of their own
repository. The agent running in Actions authenticates as the Claude GitHub App, which is
not an admin, and is bound by the rule.

The Vercel build command is `npm test && npm run build`, so a failing test aborts the
deployment and production stays on the last good version. That is the gate no one can be
talked past, admin or not. Keep its suite deterministic: tests that need audio, a device
or the network belong somewhere else, or a flaky one will hold a release hostage.

`.github/workflows/ci.yml` runs the same two checks on pull requests, for a verdict that
does not depend on the agent's own report of them. `.github/workflows/claude.yml` runs
Claude on `@claude` in a comment from a collaborator, and only there: no push, issue or
schedule trigger, because each run spends subscription quota and the repository is public,
so anyone can comment.

## Layout

```
index.html              fonts, manifest, PWA meta
src/main.jsx            entry point
src/VocalLines.jsx      the component: state, scheduler, tuner, UI
src/patterns.js         PATTERN_LIBRARY, VOICE_TYPES, PLAYBACK_MODES, toSteps, countBeats
src/pitch.js            note math, formatting, autocorrelation pitch detection
src/patterns.test.js    library invariants, toSteps, countBeats, option lists
src/pitch.test.js       note math, formatDuration, detectPitch against synthetic sines
src/styles.css          stylesheet, CSS custom properties at :root
```

Data lives in `patterns.js`, math lives in `pitch.js`, and `VocalLines.jsx` wires them to
the UI. Keep that split. A new exercise is a data change, not a component change.

## Rules

**Everything in this repository is written in English.** This holds no matter what language
the developer and the agent are speaking in chat: a conversation in Spanish still produces
English artifacts. Absolutely everything written to disk is English — documentation and
Markdown files, code, code comments, function and method names, property and variable
names, class and component names, file and directory names, CSS class names, commit
messages, and user-facing strings. There is a separate Spanish version of this project; do
not merge vocabulary from it.

**Label claims as verified or assumed, never ambiguously.** Any statement about how a
tool, engine or library behaves must be marked explicitly as verified — with the scope of
what was actually tested — or as assumed. This applies to code comments, commit messages
and anything reported back in chat.

**`Tone.start()` must stay inside the Start button's click handler.** iOS Safari only
opens an `AudioContext` from a user gesture. Moving it into an effect, a `useMemo`, or any
initialization path produces an app that is silent on iPhone and fine everywhere else,
which is the worst kind of regression to catch.

**`beats` is parallel to `degrees`.** A pattern with mismatched array lengths does not
throw; `toSteps` silently falls back to one beat for the missing entries and the exercise
plays wrong. When adding or editing a pattern with sustains, count both arrays. A test in
`patterns.test.js` now enforces this and names the offending pattern, so run `npm test`
after touching the library.

**New patterns go in `PATTERN_LIBRARY`, never inline in the component.**
`PATTERN_CATEGORIES` is derived from the array, so a new `category` value appears in the
filter chips on its own. Do not maintain a separate category list.

**Scheduling is absolute-time on the Tone Transport.** `play()` computes the entire
session up front and schedules every note and every UI highlight with `scheduleOnce`.
Playback settings are read at schedule time, so changing tempo or mode mid-session has no
effect until stop and restart — that is intended. Do not add `setTimeout` or `setInterval`
loops for note timing; they drift against the audio clock.

**Use the `getTransport()` and `getDraw()` helpers.** They exist because Tone exposes these
as getters in v15 and as properties in v14. Calling `Tone.Transport` directly breaks on one
of the two.

**Raw audio never leaves the device; derived numbers may.** The microphone buffer is
analyzed locally and discarded — this is a privacy promise made to the singer, not an
accident of an offline-only architecture, so do not delete it once a backend exists. What
that promise permits to travel over the network is *derived* data only: cents of
deviation, a score, a pitch trace expressed as a list of numbers. It never permits the
raw microphone signal or a recording of it. This is what makes accounts, cloud sync and
scoring buildable without contradicting the privacy invariant: they carry numbers, never
audio.

**Dependencies are two separate lists.** The audio core keeps its three runtime
dependencies — react, react-dom, tone — unchanged; ask before adding to that list, same as
before. Whatever the backend needs (framework, database client, auth library, and so on)
is a distinct, explicit list scoped to the architecture decision in issue #4. Do not fold
one into the other, and do not add to either without asking.

**`localStorage` is best effort.** Preference loading and saving are wrapped in try/catch
and the app must work with storage disabled. Never make persistence load-bearing.

**`detectPitch` is O(n²) per call**, running on a 2048-sample buffer every 90 ms. Raising
`fftSize` or shortening the interval is a measurable cost on low-end phones. Measure before
changing either, and say what you measured.

## Design constraints

Colors come from the custom properties at the top of `styles.css`. Amber marks what the
piano is doing, mint marks what the singer is doing, coral marks being out of tune. That
mapping is consistent across the root note, the contour bars, the keyboard strip and the
tuner needle — keep it.

The contour SVG is the one distinctive element on the page. Bar width tracks note length
and bar height tracks pitch, so a sustained note reads as a wide bar. Keep both encodings
if you touch it.

## Out of scope

Accounts and cloud sync are no longer out of scope — sign-in, saved scores, study plans
and public profiles are the direction, not a violation of it; see issue #4 for the
architecture that will carry them.

Recording or playback of the user's voice stays out, explicitly, and for a specific
reason: it is what makes "raw audio never leaves the device" true. The moment a recording
is kept instead of discarded after analysis, that invariant is gone, so this exclusion is
load-bearing, not a leftover from the offline-only design.

No song library, no MIDI export. If a request implies one of these two, raise it before
building.
