# Mn - Step name

## Tasks
- [ ] Read reference code for this step
- [ ] Data contract in `features/migration/` + service method
- [ ] Mock fixture
- [ ] Container + presentational components + hook under `components/migration/steps/<slug>/`
- [ ] Registered in `components/migration/steps/index.ts`
- [ ] Shared pieces promoted to `components/ui` only if a second step needs them

## Verification gate
- [ ] `npm run build` and `npx tsc --noEmit` clean
- [ ] Running and done states render
- [ ] Interactions work (stop, re-run, locks, modals as applicable)
- [ ] Back/Next and stepper states correct (`reached`)
- [ ] Reload keeps state
- [ ] Resize check (~700px editor, narrow sidebar)
- [ ] Dark/Light/HC themes, no hard-coded colors
- [ ] No console errors, no CDN requests
- [ ] Screenshot compared to reference

## Result
