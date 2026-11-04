# M2 - Step 1: Analyze

## Tasks
- [x] Read reference (`StepView.tsx` AnalyzeView, `content.tsx` analyze entry)
- [x] Data contract: `features/migration/analyze.ts` (`AnalysisResult`, tasks, discovery rows, metrics, artifacts)
- [x] Service: `MigrationService.getAnalysis` + `runAnalysis(project, onProgress, signal)`
- [x] Mock fixture: `services/mock/fixtures/analyze.ts`, ~9s simulated run in `MockMigrationService`
- [x] Hook `useAnalyze` (loads analysis, runs on running screen, abort on unmount = Stop)
- [x] Components: `steps/analyze/{index,DiscoveryPanel}.tsx` (running + done)
- [x] Step registry `steps/index.ts`; `PhaseScreen` renders registered steps, hides "Mark complete" on auto-advancing screens
- [x] `TaskList` gained optional `meta`; new `ArtifactCard` (cards only, no viewer)
- [x] `PhaseScreen` keyed by screen so each screen mounts fresh state

## Verification gate
- [x] `npm run build` clean
- [x] `npx tsc --noEmit` clean
- [ ] Ready -> Start -> Analyze running: tasks progress, counters count up, log grows
- [ ] Stop returns to Ready and aborts the run
- [ ] Auto-advance to `analyze-done` after completion
- [ ] Done view: tasks, discovery, blockers, artifact cards, Re-run restarts
- [ ] Back/Next and stepper states correct
- [ ] Reload on done screen keeps state
- [ ] Resize check (~700px editor, narrow sidebar)
- [ ] Dark/Light/HC themes, no hard-coded colors
- [ ] No console errors, no CDN requests
- [ ] Screenshot compared to reference

## Notes
- The root eslint config (`header/header` rule) reports every file under `customization/ui`, including pre-existing ones, so eslint is not a usable gate here yet.
- Artifact viewer deferred to the step that first needs it.
