# Fact Pop! 0.2

A local-first multiplication game, rebuilt from [nickilis613/multiplication-facts-game](https://github.com/nickilis613/multiplication-facts-game). The static edition and React app share one interface and learning engine.

## Play locally

With Node.js 22.13 or newer installed:

```sh
node serve.mjs
```

Open **http://127.0.0.1:4173/**. No dependency installation is needed for this edition. Keep the server running while playing. Use a server rather than opening index.html directly because the game uses JavaScript modules.

## The game

- **Recall:** type the product without a countdown. This is the default.
- **Sprint:** typed recall with a configurable 3, 5, or 8 second bonus window. Answers remain available after the window ends.
- **Choose:** four plausible answers, with keyboard shortcuts 1–4.
- **Short missions:** 12 questions, visible progress, XP, levels, streak bonuses, and results.
- **Focused tables:** choose any nonempty set from 2–12, paired with factors from 2–12. Start with 2s, 5s, and 10s.
- **Adaptive practice:** new and less secure facts get more weight. A missed fact returns after at least two intervening questions when the mission has room. Late misses remain prioritized in saved progress for future missions.
- **Guided correction:** see the correct fact and a worked arithmetic hint, then type the correct answer. Guided retries do not add accuracy or fluency evidence.
- **Fact collection:** commuted pairs share a record, giving 66 distinct facts. A fact is labeled “feeling fluent” after its last three typed attempts are correct, unpaused, and within 3 seconds, across at least two missions. A subsequent slow or incorrect typed answer changes that status. These are product heuristics, not validated assessment thresholds.
- **Pause:** the question is hidden; paused time is excluded from results. An answer paused before submission does not receive a speed bonus or count as fluent recall. Leaving the tab automatically pauses the mission.
- **Local progress:** XP, fact records, and preferences persist in this browser. Grown-ups can name the current student, download a restorable CSV, upload another student’s CSV, or explicitly confirm a reset. Optional Supabase teacher/parent sign-in enables online synchronization. Signed-out local play remains available.
- **Accessibility:** labeled controls, live feedback, keyboard operation, numeric touch input, visible focus, responsive layouts, and reduced-motion support. Optional audio is off by default.

Correct first attempts earn 100 XP, with 25 extra XP every third consecutive correct answer. Sprint can add up to 50 XP for speed. Incorrect first attempts earn 20 XP for effort; points are never deducted. XP measures participation and game achievement, independently of the fact collection.

## Check and package

```sh
node --test tests/*.test.mjs
node build-static.mjs
```

The production static files are copied into `dist/static/`, separate from the app build. Serve that directory with `node serve.mjs dist/static`. The repository root remains compatible with GitHub Pages; these commands do not publish remotely.

The original app stack remains available:

```sh
pnpm install
pnpm dev
pnpm build
```

`app/page.tsx` renders shared `game-view.js` markup and mounts `game.js`. `engine.js` owns scheduling, scoring, timing, and progress validation. `styles.css` is shared by both editions. No external runtime assets are needed by the game. The original social image is preserved. The upgraded game uses synthesized tones, so the old sound bundle is not included in this repository.

## Learning rationale and release boundary

The [IES mathematics intervention practice guide](https://ies.ed.gov/ncee/wwc/PracticeGuide/26) recommends systematic instruction and timed activities as one component of fluency practice. The combination of worked corrections and optional speed practice is informed by those broad recommendations; the guide does not validate this game's scheduler, three-second threshold, or effectiveness.

This is a functional local product candidate. A paid release still needs trials with learners and educators, browser/device and assistive-technology QA, and a distribution/support plan. It does not include payments, subscriptions, or claims of proven learning gains. Multiple student profiles are saved separately in each browser. Existing single-student progress is migrated automatically. Clearing browser data removes local profiles. New CSV exports are restorable backups containing student name, XP, missions, settings, and all fact recall evidence. Use the student picker to add and switch local profiles; switching ends the open mission while retaining recorded answers. Use CSV transfers between school and home. Importing can add a separate student or explicitly replace the current student, with an optional backup download first. Names do not automatically merge profiles. Reset applies only to the selected student. Older report-only CSV exports cannot be restored. CSV files are parsed locally; importing while signed in as the teacher sends their progress to the online database. Reloading ends an active mission. Local recorded answers persist in browser storage; online answers persist after the saved-online indicator appears. Online sessions remain in memory only, so refreshing requires signing in again.

## Teacher and parent access

The configured Supabase project uses one teacher and explicitly linked parent accounts. The teacher can copy local profiles online, add students, import CSVs, and link/remove a parent by confirmed account email. Parents can practice and download progress only for linked students. Account creation and password recovery currently use Supabase Authentication administration; the game does not send signup/invitation messages. No student accounts are required.

The database rejects concurrent stale writes. If an online save fails, keep the page open and export each affected student as CSV before explicitly reloading online progress. The app does not silently merge or overwrite conflicts. Check the saved-online indicator before closing a tab.
