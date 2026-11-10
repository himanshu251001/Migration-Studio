/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Inline "Start discussion" box of the Migration Studio comments, shown under the block whose "+" was clicked.
// Runs inside the Markdown preview webview (compiled to out/preview.js).
(() => {
	function blockOf(line: string | null): HTMLElement | null {
		return document.querySelector<HTMLElement>(`.ms-comment-block[data-ms-line="${line}"]`);
	}

	function closeAll(): void {
		document.querySelectorAll<HTMLElement>('.ms-form').forEach(form => { form.hidden = true; });
	}

	// The preview only forwards clicks it trusts to the extension, so the click on the "Add Comment" link itself must do the
	// work: its target is filled in here, just before the click is handled. A scripted click would navigate the preview away.
	function prepare(block: HTMLElement, link: Element): boolean {
		const text = block.querySelector<HTMLTextAreaElement>('.ms-form-text')!.value.trim();
		link.setAttribute('href', text ? `${block.getAttribute('data-ms-add-uri')}&text=${encodeURIComponent(text)}` : '#');
		return !!text;
	}

	document.addEventListener('click', event => {
		const target = event.target;
		if (!(target instanceof Element)) {
			return;
		}
		const add = target.closest('.ms-comment-add');
		if (add) {
			event.preventDefault();
			event.stopPropagation();
			const block = blockOf(add.getAttribute('data-ms-line'));
			if (block) {
				closeAll();
				const form = block.querySelector<HTMLElement>('.ms-form')!;
				form.hidden = false;
				form.querySelector<HTMLTextAreaElement>('.ms-form-text')!.focus();
			}
			return;
		}
		const inBlock = target.closest<HTMLElement>('.ms-comment-block');
		if (target.closest('.ms-form-cancel')) {
			closeAll();
		} else {
			const submitLink = target.closest('.ms-form-submit');
			if (submitLink && inBlock && !prepare(inBlock, submitLink)) {
				event.preventDefault();
				event.stopPropagation();
			}
		}
	}, true);

	document.addEventListener('keydown', event => {
		const target = event.target;
		if (target instanceof Element && target.closest('.ms-form') && event.key === 'Escape') {
			closeAll();
		}
	});
})();
