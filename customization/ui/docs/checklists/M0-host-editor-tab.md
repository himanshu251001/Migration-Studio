# M0 - Host: editor-tab support (back-filled from the working tree)

## Tasks
- [x] `location` on registry features
- [x] `customizationFrame.ts`, `customizationEditorInput.ts`, `customizationEditor.ts`
- [x] `openEditor` bridge message in `hostBridgeProtocol.ts`
- [ ] `navigate` bridge message (not confirmed)
- [ ] `hostBridgeProtocol.test.ts` covers new messages

## Verification gate
- [ ] `scripts/test.sh --grep hostBridgeProtocol`
- [ ] `npm run eslint -- <changed files>`
- [ ] `npm run valid-layers-check`
- [ ] Manual: a button opens an editor tab that renders and themes correctly
