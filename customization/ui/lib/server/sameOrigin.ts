/**
 * Only the app itself may call the project API: it reads and writes the local disk, and the server listens on
 * loopback where any web page in the user's browser could otherwise reach it. Browsers set `Sec-Fetch-Site`
 * on every request they make, so anything not same-origin is refused.
 */
export function isSameOrigin(request: Request): boolean {
	return request.headers.get('sec-fetch-site') === 'same-origin';
}
