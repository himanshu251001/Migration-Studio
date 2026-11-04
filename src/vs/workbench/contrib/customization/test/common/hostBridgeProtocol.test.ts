/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isAppRoute, isTrustedOrigin, parseInboundMessage } from '../../common/hostBridgeProtocol.js';

suite('Customization Host Bridge Protocol', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parseInboundMessage', () => {
		assert.deepStrictEqual(
			[
				parseInboundMessage({ v: 1, type: 'ready', payload: { route: '/a' } }),
				parseInboundMessage({ v: 2, type: 'ready', payload: { route: '/a' } }),
				parseInboundMessage({ v: 1, type: 'unknown', payload: {} }),
				parseInboundMessage({ v: 1, type: 'ready', payload: { route: 1 } }),
				parseInboundMessage({ v: 1, type: 'ready' }),
				parseInboundMessage('ready'),
				parseInboundMessage(null),
			],
			[
				{ v: 1, type: 'ready', payload: { route: '/a' } },
				undefined, undefined, undefined, undefined, undefined, undefined
			]
		);
	});

	test('parseInboundMessage editor messages', () => {
		assert.deepStrictEqual(
			[
				parseInboundMessage({ v: 1, type: 'openEditor', payload: { route: '/migration/ready', title: 'Migration Studio' } }),
				parseInboundMessage({ v: 1, type: 'openEditor', payload: { route: 'http://evil.com', title: 'x' } }),
				parseInboundMessage({ v: 1, type: 'openEditor', payload: { route: '//evil.com', title: 'x' } }),
				parseInboundMessage({ v: 1, type: 'openEditor', payload: { route: '/a' } }),
				parseInboundMessage({ v: 1, type: 'closeEditor', payload: {} }),
				parseInboundMessage({ v: 1, type: 'closeEditor' }),
			],
			[
				{ v: 1, type: 'openEditor', payload: { route: '/migration/ready', title: 'Migration Studio' } },
				undefined, undefined, undefined,
				{ v: 1, type: 'closeEditor', payload: {} },
				undefined
			]
		);
		assert.deepStrictEqual([isAppRoute('/a/b?x=1'), isAppRoute('a'), isAppRoute('/a\\b')], [true, false, false]);
	});

	test('isTrustedOrigin', () => {
		assert.deepStrictEqual(
			[
				isTrustedOrigin('http://127.0.0.1:3939', 'http://127.0.0.1:3939/migration'),
				isTrustedOrigin('http://127.0.0.1:3940', 'http://127.0.0.1:3939'),
				isTrustedOrigin('http://evil.com', 'http://127.0.0.1:3939'),
				isTrustedOrigin('http://127.0.0.1:3939', 'not a url'),
			],
			[true, false, false, false]
		);
	});
});
