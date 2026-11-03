/**
 * Browser half of `dsh-credit-compass` (Credits Compass).
 *
 * One cell in the sidebar foot (`sidebar.footer.action`, beside Settings) that
 * shows what is LEFT on whichever account the current model selection points at,
 * plus a detail panel on click and a manual refresh button.
 *
 * ## Which number this shows
 *
 * The readout follows the session's model selection, because a figure that
 * disagrees with the model actually in effect is worse than no figure:
 *
 *   - `workbuddy` / `workbuddy-global`
 *       -> `/plugins/dsh-connect-workbuddy/usage?region=cn|global`, whose
 *          `credits.total` is exactly the "remaining" number the composer pill
 *          shows. `credits.packages` is the per-package breakdown.
 *   - any other provider
 *       -> the DeepSeek account wallet through `remote.account.getBalance()`,
 *          which answers `{ status: 'ready', value: [{ currency, balance }],
 *          bonusWallets: [...] }`.
 *
 * The provider comes from `ctx.modelDirectories.directoryFor(sessionId).store`,
 * i.e. the same store the composer's model picker renders from. Both lookups are
 * optional: a deployment without `dsh-connect-workbuddy` or without a signed-in
 * account simply produces no cell, and a transient failure keeps the last number
 * instead of blanking it.
 *
 * ## Why the whole bundle is one IIFE
 *
 * A combo script concatenates several packages' `client.js` into one classic
 * script, and classic scripts share the global lexical scope: a top-level
 * `const` here would collide with the same identifier in another hand-written
 * bundle, the browser would throw `Identifier 'X' has already been declared`,
 * nothing in the script would register, and the boot audit would refuse the whole
 * startup. Same for `function` declarations, which silently overwrite each other.
 * The wrapper is the one line that must never be lost in an edit.
 *
 * Nothing below may throw out of `loader.load` or out of the
 * `ctx.slots.inject` callback: the first runs while the module system walks the
 * startup list, the second runs inside the slot owner's own `register()` call,
 * and an escaping throw fails THAT entry's activation — which the deployment
 * treats as a refused startup.
 */
(function () {
	'use strict';

	/** One warning per key per page: a broken cell must not spam the console. */
	const REPORTED = new Set();

	function report(message) {
		try {
			// eslint-disable-next-line no-console
			console.warn('[credit-compass] ' + message);
		} catch (ignored) {
			// A console that throws is not worth a second thought.
		}
	}

	function describeError(error) {
		if (error === null || error === undefined) return String(error);
		return error.message === undefined ? String(error) : String(error.message);
	}

	function reportOnce(key, message) {
		if (REPORTED.has(key)) return;
		REPORTED.add(key);
		report(message);
	}

	const loader = typeof window === 'undefined' ? undefined : window.__ModuleLoader__;

	if (loader === undefined || loader === null || typeof loader.load !== 'function') {
		report('module loader is absent; the bundle registered nothing');
	} else {
		try {
			loader.load({
				id: 'dsh-credit-compass',
				factory: function (require) {
					const module = { exports: {} };
					const exports = module.exports;

					try {
						build(require, exports);
					} catch (error) {
						// An inert plugin still activates, which keeps the boot audit satisfied.
						reportOnce('build', 'bundle body failed, staying inert: ' + describeError(error));
						exports.apply = function apply() {};
						exports.inject = [];
					}

					return module.exports;
				}
			});
		} catch (error) {
			// Reachable when this id already sits in the factory table (a batch script
			// registered it, then this one-resource URL did). Swallowing the duplicate
			// keeps the remaining packages of a batch script loading.
			reportOnce('register', 'bundle registration was refused: ' + describeError(error));
		}
	}

	/**
	 * The module body.
	 *
	 * @param {(specifier: string) => any} require
	 * @param {any} exports
	 */
	function build(require, exports) {
		const React = require('react');
		if (React === undefined || React === null || typeof React.createElement !== 'function') {
			throw new Error('react did not resolve to a React runtime');
		}
		// `react-dom` is a platform seed word. The panel is portaled to `document.body`:
		// the sidebar is a scrolling, transformed column, so a `position: fixed` child
		// left inside it would be placed against the wrong box.
		const createPortal = (function () {
			try {
				const reactDom = require('react-dom');
				return reactDom !== null && typeof reactDom.createPortal === 'function' ? reactDom.createPortal : null;
			} catch (error) {
				return null;
			}
		})();

		const SLOT = 'sidebar.footer.action';
		const SLOT_ID = 'credit-compass';
		/** Left of the shipped `cordis-panel` cell, which is registered at the default 0. */
		const SLOT_ORDER = -1;

		/** WorkBuddy's own route and refresh cadence (its client polls the same 5 minutes). */
		const USAGE_PATH = '/plugins/dsh-connect-workbuddy/usage';
		/** The provider ids WorkBuddy registers, and the region each one serves. */
		const WORKBUDDY_REGIONS = { workbuddy: 'cn', 'workbuddy-global': 'global' };
		const REGIONS = ['cn', 'global'];
		const REFRESH_MS = 300_000;

		/** Viewport margin the placement clamp keeps, and the gap to the trigger. */
		const PANEL_MARGIN = 12;
		const PANEL_GAP = 8;
		/** Unplaced portal panel: hidden but laid out so the clamp can measure it. */
		const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };
		/** Separator that cannot appear in a provider or model id. */
		const KEY_SEPARATOR = '\u0000';

		const DICTIONARIES = {
			zh: {
				title: '剩余额度',
				titleBalance: '账户余额',
				detail: '额度明细',
				detailBalance: '账户余额明细',
				total: '剩余合计',
				unit: '额度',
				pkg: '额度包',
				remain: '剩余',
				monthly: '每月刷新',
				expires: '到期',
				nearest: '最近到期',
				empty: '暂无额度包',
				bonusEmpty: '暂无赠送余额',
				bonus: '赠送',
				wallet: '钱包',
				refreshed: '更新于',
				hint: '点击查看明细',
				refresh: '刷新',
				source: '来源',
				current: '当前显示',
				currency: '显示币种',
				auto: '自动',
				cny: '人民币',
				usd: '美元'
			},
			en: {
				title: 'Credits left',
				titleBalance: 'Account balance',
				detail: 'Credit packages',
				detailBalance: 'Account balance',
				total: 'Remaining',
				unit: 'credits',
				pkg: 'Package',
				remain: 'Left',
				monthly: 'monthly',
				expires: 'expires',
				nearest: 'Next expiry',
				empty: 'No credit packages',
				bonusEmpty: 'No bonus balance',
				bonus: 'Bonus',
				wallet: 'Wallet',
				refreshed: 'Updated',
				hint: 'Click for details',
				refresh: 'Refresh',
				source: 'Source',
				current: 'Shown',
				currency: 'Currency',
				auto: 'Auto',
				cny: 'Chinese yuan',
				usd: 'US dollar'
			}
		};

		/**
		 * The cell is a slot occupant, so it receives no translator. The language is
		 * read from the document at render time, which also follows a locale switch.
		 */
		function copy() {
			try {
				const explicit = typeof document === 'undefined' ? null : document.documentElement.getAttribute('lang');
				const tag =
					explicit === null || explicit === undefined
						? typeof navigator === 'undefined'
							? null
							: navigator.language
						: explicit;
				return String(tag === null || tag === undefined ? 'en' : tag)
					.toLowerCase()
					.indexOf('zh') === 0
					? DICTIONARIES.zh
					: DICTIONARIES.en;
			} catch (error) {
				return DICTIONARIES.en;
			}
		}

		/** `1234.5` -> `"1,234.50"`; a non-finite input -> null. */
		function amountText(value) {
			const numeric = Number(value);
			if (!Number.isFinite(numeric)) return null;
			return numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		}

		/** A compact headline: two decimals below 1000, whole numbers above it. */
		function compactText(value) {
			const numeric = Number(value);
			if (!Number.isFinite(numeric)) return null;
			if (Math.abs(numeric) >= 1000) {
				return numeric.toLocaleString('en-US', { maximumFractionDigits: 0 });
			}
			return numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		}

		function dateText(ms) {
			const numeric = Number(ms);
			if (!Number.isFinite(numeric) || numeric <= 0) return null;
			try {
				return new Date(numeric).toLocaleDateString(undefined, {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit'
				});
			} catch (error) {
				return null;
			}
		}

		/** The account route wants a client descriptor; it is a version + locale + TZ offset. */
		function clientMetadata() {
			return {
				version: 'dsh-desktop',
				locale: typeof navigator === 'undefined' ? 'en' : navigator.language ?? 'en',
				timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
			};
		}

		/** Currency glyphs the wallet uses; anything else prints its ISO code. */
		const CURRENCY_SIGNS = { CNY: '¥', USD: '$', HKD: 'HK$', EUR: '€', JPY: '¥', GBP: '£' };

		function moneyText(currency, amount) {
			const value = amountText(amount);
			if (value === null) return null;
			const sign = CURRENCY_SIGNS[currency];
			return sign === undefined ? value + ' ' + currency : sign + value;
		}

		/** A wallet's name in the reader's language, falling back to its ISO code. */
		function currencyName(currency, t) {
			if (currency === 'CNY') return t.cny;
			if (currency === 'USD') return t.usd;
			return currency;
		}

		/** The user's currency choice for a DeepSeek personal account: 'auto', 'CNY' or 'USD'. */
		const CURRENCY_KEY = 'dsh-credit-compass:currency';
		/** The key this plugin stored the choice under before it was renamed. */
		const LEGACY_CURRENCY_KEY = 'dsh-sidebar-credits:currency';

		function readCurrencyPreference() {
			try {
				const stored = window.localStorage.getItem(CURRENCY_KEY);
				if (stored === 'CNY' || stored === 'USD') return stored;
				if (stored === 'auto') return 'auto';
				// Carry a choice made under the pre-rename key over, so renaming the
				// bundle does not silently drop the reader's setting.
				const legacy = window.localStorage.getItem(LEGACY_CURRENCY_KEY);
				if (legacy === 'CNY' || legacy === 'USD') {
					window.localStorage.setItem(CURRENCY_KEY, legacy);
					window.localStorage.removeItem(LEGACY_CURRENCY_KEY);
					return legacy;
				}
				return 'auto';
			} catch (error) {
				return 'auto';
			}
		}

		function writeCurrencyPreference(value) {
			try {
				if (value === 'CNY' || value === 'USD') window.localStorage.setItem(CURRENCY_KEY, value);
				else window.localStorage.removeItem(CURRENCY_KEY);
				window.localStorage.removeItem(LEGACY_CURRENCY_KEY);
			} catch (error) {
				// A blocked storage keeps the choice for this page only.
			}
		}

		/**
		 * The currency the operating system's region settles in.
		 *
		 * The account answers in CNY and USD at once, so the region is what decides
		 * which of the two belongs on screen. The browser language carries the
		 * region subtag; when it is missing (a bare `zh` or `en` tag) the time zone
		 * is the next-best signal, and the language family is the last resort.
		 */
		function regionCurrency() {
			let tag = '';
			try {
				tag = typeof navigator === 'undefined' || navigator.language === null ? '' : navigator.language;
			} catch (error) {
				tag = '';
			}
			if (tag === '') {
				try {
					tag = document.documentElement.getAttribute('lang') ?? '';
				} catch (error) {
					tag = '';
				}
			}
			const lower = String(tag).toLowerCase();
			const matched = /[-_]([a-z]{2})(?:$|[-_])/.exec(lower);
			const region = matched === null ? '' : matched[1].toUpperCase();
			if (region === 'CN') return 'CNY';
			if (region === 'US') return 'USD';

			let zone = '';
			try {
				zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
			} catch (error) {
				zone = '';
			}
			if (zone === 'Asia/Shanghai' || zone === 'Asia/Chongqing' || zone === 'Asia/Harbin') return 'CNY';
			return lower.indexOf('zh') === 0 ? 'CNY' : 'USD';
		}

		/** One row per currency: the wallet total, the granted bonus, and how many entries fed them. */
		function summarizeWallets(snapshot) {			const rows = [];
			const index = new Map();
			const push = function (wallet, key) {
				if (wallet === null || wallet === undefined) return;
				const currency = typeof wallet.currency === 'string' ? wallet.currency : '';
				if (currency.length === 0) return;
				let row = index.get(currency);
				if (row === undefined) {
					row = { currency: currency, amount: 0, bonus: 0, entries: 0 };
					index.set(currency, row);
					rows.push(row);
				}
				row[key] += wallet.amount;
				row.entries += 1;
			};
			const wallets = Array.isArray(snapshot.wallets) ? snapshot.wallets : [];
			for (let position = 0; position < wallets.length; position += 1) push(wallets[position], 'amount');
			const bonus = Array.isArray(snapshot.bonus) ? snapshot.bonus : [];
			for (let position = 0; position < bonus.length; position += 1) push(bonus[position], 'bonus');
			return rows;
		}

		/**
		 * The currency a DeepSeek personal account shows.
		 *
		 * An explicit choice wins. On `auto` the region's wallet leads, but only
		 * while it carries money: an empty regional wallet loses to the other
		 * currency that does have a balance, so the cell never reads a bare zero
		 * while the account holds something elsewhere.
		 */
		function selectCurrency(snapshot, preference) {
			const rows = summarizeWallets(snapshot);
			if (rows.length === 0) return null;
			const find = function (currency) {
				for (let position = 0; position < rows.length; position += 1) {
					if (rows[position].currency === currency) return rows[position];
				}
				return null;
			};
			if (preference === 'CNY' || preference === 'USD') {
				const chosen = find(preference);
				if (chosen !== null) return chosen;
			}
			const regional = find(regionCurrency());
			if (regional !== null && regional.amount > 0) return regional;
			for (let position = 0; position < rows.length; position += 1) {
				if (rows[position].amount > 0) return rows[position];
			}
			if (regional !== null && regional.bonus > 0) return regional;
			for (let position = 0; position < rows.length; position += 1) {
				if (rows[position].bonus > 0) return rows[position];
			}
			return regional === null ? rows[0] : regional;
		}

		/**
		 * Read one region's WorkBuddy usage document.
		 *
		 * @param {string} region
		 * @param {AbortSignal | undefined} signal
		 * @returns {Promise<any>} the parsed document, or null when the route is absent.
		 */
		async function readRegion(region, signal) {
			let response;
			try {
				response = await fetch(USAGE_PATH + '?region=' + encodeURIComponent(region), {
					headers: { accept: 'application/json' },
					credentials: 'same-origin',
					signal: signal
				});
			} catch (error) {
				// An aborted read is the unmount path, not a fault worth reporting.
				if (signal !== undefined && signal !== null && signal.aborted) return null;
				throw error;
			}
			if (!response.ok) throw new Error('HTTP ' + response.status);
			try {
				return await response.json();
			} catch (error) {
				reportOnce('json', 'usage answer was not JSON: ' + describeError(error));
				return null;
			}
		}

		/**
		 * One region's credits, or null when that region is not signed in.
		 *
		 * @param {string} region
		 * @param {AbortSignal | undefined} signal
		 * @returns {Promise<{ kind: 'credits', credits: any, provider: string, updatedAt: number } | null>}
		 */
		async function readWorkbuddyRegion(region, signal) {
			const document_ = await readRegion(region, signal);
			if (document_ === null || document_ === undefined) return null;
			if (document_.status !== 'signed-in') return null;
			const credits = document_.credits;
			if (credits === null || credits === undefined) return null;
			if (!Number.isFinite(Number(credits.total))) return null;
			return {
				kind: 'credits',
				credits: credits,
				provider: region,
				updatedAt: Date.now()
			};
		}

		function normalizeWallets(list) {
			const wallets = [];
			if (!Array.isArray(list)) return wallets;
			for (let index = 0; index < list.length; index += 1) {
				const item = list[index];
				if (item === null || item === undefined) continue;
				const amount = Number(item.balance);
				if (!Number.isFinite(amount)) continue;
				const currency =
					typeof item.currency === 'string' && item.currency.length > 0 ? item.currency : 'CNY';
				wallets.push({ currency: currency, amount: amount });
			}
			return wallets;
		}

		/**
		 * The DeepSeek account wallet, for every provider that is not WorkBuddy's.
		 *
		 * @param {(name: string) => any} getService
		 * @returns {Promise<{ kind: 'balance', wallets: any[], bonus: any[], updatedAt: number } | null>}
		 */
		async function readOfficialBalance(getService) {
			let account = null;
			try {
				account = typeof getService === 'function' ? getService('remote.account') : null;
			} catch (error) {
				account = null;
			}
			if (account === null || account === undefined || typeof account.getBalance !== 'function') return null;

			let result;
			try {
				result = await account.getBalance(clientMetadata());
			} catch (error) {
				reportOnce('balance', 'account balance read failed: ' + describeError(error));
				return null;
			}
			if (result === null || result === undefined) return null;
			if (result.ok === false) return null;
			const value = result.ok === true ? result.value : result;
			if (value === null || value === undefined) return null;
			if (value.status !== 'ready') return null;

			const wallets = normalizeWallets(value.value);
			const bonus = normalizeWallets(value.bonusWallets);
			if (wallets.length === 0 && bonus.length === 0) return null;
			return { kind: 'balance', wallets: wallets, bonus: bonus, updatedAt: Date.now() };
		}

		/**
		 * Read the figure that belongs to `provider`.
		 *
		 * A known WorkBuddy provider reads ONLY its own region: a cn figure shown next
		 * to a global model would be a lie. Any other provider is the DeepSeek account.
		 * With no selection yet (a brand-new session whose catalog is still loading)
		 * whichever account answers wins, which keeps the cell from blinking out
		 * during startup.
		 *
		 * @param {string | null} provider
		 * @param {AbortSignal | undefined} signal
		 * @param {(name: string) => any} getService
		 */
		async function readCurrent(provider, signal, getService) {
			if (typeof provider === 'string' && provider.length > 0) {
				const region = WORKBUDDY_REGIONS[provider];
				if (typeof region === 'string') return await readWorkbuddyRegion(region, signal);
				return await readOfficialBalance(getService);
			}

			for (let index = 0; index < REGIONS.length; index += 1) {
				let value = null;
				try {
					value = await readWorkbuddyRegion(REGIONS[index], signal);
				} catch (error) {
					if (signal !== undefined && signal !== null && signal.aborted) return null;
					reportOnce('read-' + REGIONS[index], 'usage read failed: ' + describeError(error));
					value = null;
				}
				if (value !== null) return value;
			}
			return await readOfficialBalance(getService);
		}

		/**
		 * Stylesheet, rendered by the component itself so it disappears with the cell.
		 * Geometry follows the shipped sidebar-foot badge (`CordisPanel.module.css`:
		 * 42px row, 12px radius, 14px label) so the two cells read as one control bar.
		 */
		const CSS =
			// The foot is a single flex ROW shared with the shipped `cordis-panel` cell
			// (and anything else that registers here), so this cell sizes to its own
			// content (`flex: 0 0 auto`) and stays left-aligned: a 100%-wide cell would
			// push whatever else is in the row out of the sidebar's clipped edge.
			'.dshcred_root{box-sizing:border-box;flex:0 0 auto;width:auto;max-width:100%;min-width:0;height:42px;display:flex;align-items:center;gap:2px;position:relative}' +
			'.dshcred_root[data-rail=true]{width:36px;height:36px}' +
			'.dshcred_button{box-sizing:border-box;width:auto;max-width:100%;height:42px;margin:0;padding:0 10px 0 8px;display:inline-flex;align-items:center;gap:7px;overflow:hidden;min-width:0;border:none;border-radius:12px;background:0 0;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:22px;cursor:pointer;text-align:left}' +
			'.dshcred_button:hover,.dshcred_button[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}' +
			'.dshcred_button svg{flex:none;width:16px;height:16px;color:var(--dsw-alias-label-secondary)}' +
			'.dshcred_label{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
			'.dshcred_value{flex:none;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-size:13px;line-height:18px;margin-left:auto}' +
			'.dshcred_refresh{flex:none;width:24px;height:24px;margin:0;padding:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer}' +
			'.dshcred_refresh:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}' +
			'.dshcred_refresh svg{width:14px;height:14px;color:inherit}' +
			'.dshcred_refresh[data-busy=true] svg{animation:dshcred_spin .9s linear infinite}' +
			'@keyframes dshcred_spin{to{transform:rotate(360deg)}}' +
			'.dshcred_root[data-rail=true] .dshcred_button{width:36px;height:36px;border-radius:50%;justify-content:center;gap:0;padding:0;margin:0}' +
			'.dshcred_root[data-rail=true] .dshcred_label,.dshcred_root[data-rail=true] .dshcred_value,.dshcred_root[data-rail=true] .dshcred_refresh{display:none}' +
			'.dshcred_panel{isolation:isolate;z-index:1100;position:fixed;width:380px;max-width:calc(100vw - 24px);max-height:min(60vh,520px);display:flex;flex-direction:column;border:0;border-radius:12px;overflow:hidden;box-shadow:var(--dsw-elevation-prominent);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:default}' +
			'.dshcred_panel:before{z-index:-1;content:"";position:absolute;inset:0;border-radius:inherit;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);pointer-events:none}' +
			'.dshcred_header{flex:none;min-height:44px;padding:10px 14px;display:flex;align-items:center;gap:8px}' +
			'.dshcred_header svg{flex:none;width:16px;height:16px;color:var(--dsw-alias-brand-primary)}' +
			'.dshcred_title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:20px}' +
			'.dshcred_close{flex:none;width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:16px;line-height:1}' +
			'.dshcred_close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}' +
			'.dshcred_body{flex:1;min-height:0;overflow-y:auto;padding:0 14px 14px}' +
			'.dshcred_hero{margin:0 0 10px;padding:10px 12px;border-radius:10px;background:var(--dsw-alias-bg-layer-2);display:flex;align-items:baseline;gap:8px}' +
			'.dshcred_heroValue{color:var(--dsw-alias-label-primary);font-size:22px;line-height:28px;font-weight:600;font-variant-numeric:tabular-nums}' +
			'.dshcred_heroUnit{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px}' +
			'.dshcred_heroMeta{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:16px;font-variant-numeric:tabular-nums}' +
			'.dshcred_list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}' +
			'.dshcred_item{padding:8px 10px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);display:flex;flex-direction:column;gap:2px;min-width:0}' +
			'.dshcred_item[data-current=true]{border-color:var(--dsw-alias-brand-primary)}' +
			'.dshcred_picker{margin:0 0 10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}' +
			'.dshcred_pickerLabel{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;margin-right:2px}' +
			'.dshcred_pick{padding:3px 8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:0 0;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:16px;cursor:pointer}' +
			'.dshcred_pick:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}' +
			'.dshcred_pick[data-active=true]{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}' +
			'.dshcred_itemTop{display:flex;align-items:baseline;gap:8px;min-width:0}' +
			'.dshcred_itemName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary)}' +
			'.dshcred_itemValue{flex:none;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}' +
			'.dshcred_itemSub{display:flex;align-items:baseline;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}' +
			'.dshcred_itemSub span:last-child{margin-left:auto}' +
			'.dshcred_foot{flex:none;padding:8px 14px 10px;border-top:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;display:flex;gap:8px}' +
			'.dshcred_foot span:last-child{margin-left:auto;font-variant-numeric:tabular-nums}';

		/**
		 * Compass glyph: the needle points at whichever account the model selection
		 * is on. Drawn rather than typed so any UI font can render it.
		 */
		function creditsIcon() {
			return React.createElement(
				'svg',
				{ viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
				React.createElement('circle', {
					cx: '8',
					cy: '8',
					r: '5.9',
					stroke: 'currentColor',
					strokeWidth: '1.4',
					opacity: '0.55'
				}),
				React.createElement('path', {
					d: 'M10.8 5.2 8.9 8.9 5.2 10.8 7.1 7.1Z',
					fill: 'currentColor'
				}),
				React.createElement('circle', { cx: '8', cy: '8', r: '0.9', fill: 'currentColor' })
			);
		}

		/** Refresh glyph: a circular arrow, matching the 16px grid of the cell icon. */
		function refreshIcon() {
			return React.createElement(
				'svg',
				{ viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
				React.createElement('path', {
					d: 'M13.1 8a5.1 5.1 0 1 1-1.49-3.61',
					stroke: 'currentColor',
					strokeWidth: '1.4',
					strokeLinecap: 'round'
				}),
				React.createElement('path', {
					d: 'M13.3 2.6v3.1H10.2',
					stroke: 'currentColor',
					strokeWidth: '1.4',
					strokeLinecap: 'round',
					strokeLinejoin: 'round'
				})
			);
		}

		/**
		 * The session the main view currently shows. `sidebar.footer.action` is a
		 * root-scope slot, so this hook is the one seam to per-session state; it is
		 * the same selector the shipped cordis panel uses.
		 */
		function selectMainViewSessionId(state) {
			try {
				if (state === null || state === undefined) return null;
				const byId = state.byId;
				if (byId === null || byId === undefined) return null;
				const ids = Object.keys(byId);
				for (let index = 0; index < ids.length; index += 1) {
					const entry = byId[ids[index]];
					if (entry === null || entry === undefined) continue;
					const retained = entry.retainedBy;
					if (retained === null || retained === undefined) continue;
					if (Number(retained.mainView ?? 0) > 0) return ids[index];
				}
			} catch (error) {
				// A malformed snapshot is not worth a warning per render.
			}
			return null;
		}

		/**
		 * The sidebar-foot cell.
		 *
		 * @param {any} props - owner props (`wide`, the standard slot hooks) plus this
		 *   registration's inject face (`getService`).
		 */
		function CreditsCell(props) {
			const wide = props === undefined || props === null ? true : props.wide !== false;
			const useSessions = props === undefined || props === null ? undefined : props.useSessions;
			const getService = props === undefined || props === null ? undefined : props.getService;

			// Both branches call exactly one hook, so the hook order survives a
			// deployment that injects no standard props at all.
			let sessionId;
			if (typeof useSessions === 'function') {
				sessionId = useSessions(selectMainViewSessionId);
			} else {
				sessionId = React.useState(null)[0];
			}

			const providerState = React.useState(null);
			const providerKey = providerState[0];
			const setProviderKey = providerState[1];

			const snapshotState = React.useState(null);
			const snapshot = snapshotState[0];
			const setSnapshot = snapshotState[1];

			const tickState = React.useState(0);
			const tick = tickState[0];
			const setTick = tickState[1];

			const busyState = React.useState(false);
			const busy = busyState[0];
			const setBusy = busyState[1];

			const openState = React.useState(false);
			const open = openState[0];
			const setOpen = openState[1];

			const positionState = React.useState(null);
			const position = positionState[0];
			const setPosition = positionState[1];

			const currencyState = React.useState(readCurrencyPreference);
			const currencyChoice = currencyState[0];
			const setCurrencyChoice = currencyState[1];

			const rootRef = React.useRef(null);
			const panelRef = React.useRef(null);

			// Follow the model the session is pointed at. `current` is null until the
			// Host catalog loads, so the key is re-read on every store notification and
			// the cell keeps the fallback read until a real selection appears.
			React.useEffect(
				function () {
					if (sessionId === null || sessionId === undefined) {
						setProviderKey(null);
						return undefined;
					}

					let directory = null;
					try {
						const directories = typeof getService === 'function' ? getService('modelDirectories') : null;
						if (
							directories === null ||
							directories === undefined ||
							typeof directories.directoryFor !== 'function'
						) {
							setProviderKey(null);
							return undefined;
						}
						directory = directories.directoryFor(sessionId);
					} catch (error) {
						// Unknown or subagent sessions are not selectable; the fallback read
						// still shows whichever account answers.
						reportOnce('provider', 'model selection is unavailable: ' + describeError(error));
						setProviderKey(null);
						return undefined;
					}

					let live = true;
					const read = function () {
						if (!live) return;
						let next = null;
						try {
							const store = directory.store;
							const value = store === null || store === undefined ? null : store.getSnapshot();
							const selection = value === null || value === undefined ? null : value.current;
							const provider =
								selection === null || selection === undefined ? null : selection.provider;
							if (typeof provider === 'string' && provider.length > 0) {
								const model = typeof selection.model === 'string' ? selection.model : '';
								next = provider + KEY_SEPARATOR + model;
							}
						} catch (error) {
							next = null;
						}
						// A plain string keeps React's bail-out working: an identical key does
						// not re-render, so a 5-minute poll cannot thrash the read effect.
						setProviderKey(function (previous) {
							return previous === next ? previous : next;
						});
					};

					let unsubscribe = null;
					read();
					try {
						unsubscribe = directory.store.subscribe(read);
					} catch (error) {
						unsubscribe = null;
					}
					try {
						// Ensure the catalog is loaded; a failure is reported by the read.
						Promise.resolve(directory.load()).catch(function () {});
					} catch (error) {
						// nothing to do: the store subscription still updates
					}

					return function () {
						live = false;
						try {
							if (typeof unsubscribe === 'function') unsubscribe();
						} catch (error) {
							// nothing to clean up
						}
					};
				},
				[sessionId, getService, setProviderKey]
			);

			// Read loop. `tick` is the manual refresh: it re-runs this effect, which
			// resets the cadence as well as performing the immediate read.
			React.useEffect(
				function () {
					let live = true;
					let controller = null;
					let timer = 0;
					setBusy(true);

					const read = function () {
						try {
							if (typeof AbortController === 'function') controller = new AbortController();
						} catch (error) {
							controller = null;
						}
						const signal = controller === null ? undefined : controller.signal;
						const provider = providerKey === null ? null : providerKey.split(KEY_SEPARATOR)[0];
						Promise.resolve()
							.then(function () {
								return readCurrent(provider, signal, getService);
							})
							.then(
								function (value) {
									if (!live) return;
									setSnapshot(value === undefined ? null : value);
									setBusy(false);
								},
								function (error) {
									if (!live) return;
									setBusy(false);
									reportOnce('read', 'credit read failed: ' + describeError(error));
									// A failed read keeps the last number: a stale figure reads as
									// "unchanged", while a disappearing cell reads as "plugin broken".
								}
							);
					};

					read();
					timer = setInterval(read, REFRESH_MS);
					return function () {
						live = false;
						clearInterval(timer);
						try {
							if (controller !== null) controller.abort();
						} catch (error) {
							// nothing to clean up
						}
					};
				},
				[providerKey, tick, getService, setSnapshot, setBusy]
			);

			React.useEffect(
				function () {
					if (!open) return undefined;

					/** Place the panel beside the sidebar foot and clamp it into the viewport. */
					const reposition = function () {
						try {
							const anchor = rootRef.current;
							const panel = panelRef.current;
							const view = typeof window === 'undefined' ? undefined : window;
							if (anchor === null || panel === null || view === undefined) return;
							const rect = anchor.getBoundingClientRect();
							const width = panel.offsetWidth;
							const height = panel.offsetHeight;
							// The foot sits in the bottom-left corner: open to the RIGHT of the
							// sidebar and keep the panel's bottom aligned with the cell.
							const left = Math.min(
								Math.max(PANEL_MARGIN, rect.right + PANEL_GAP),
								Math.max(PANEL_MARGIN, view.innerWidth - width - PANEL_MARGIN)
							);
							const top = Math.min(
								Math.max(PANEL_MARGIN, rect.bottom - height),
								Math.max(PANEL_MARGIN, view.innerHeight - height - PANEL_MARGIN)
							);
							setPosition({ left: Math.round(left) + 'px', top: Math.round(top) + 'px' });
						} catch (error) {
							reportOnce('position', 'panel positioning failed: ' + describeError(error));
						}
					};

					reposition();
					const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(reposition) : 0;

					const onPointerDown = function (event) {
						try {
							const anchor = rootRef.current;
							const panel = panelRef.current;
							const inside =
								(anchor !== null && anchor.contains(event.target)) ||
								(panel !== null && panel.contains(event.target));
							if (!inside) setOpen(false);
						} catch (error) {
							setOpen(false);
						}
					};
					const onKeyDown = function (event) {
						if (event.key === 'Escape') setOpen(false);
					};

					document.addEventListener('pointerdown', onPointerDown, true);
					document.addEventListener('keydown', onKeyDown);
					window.addEventListener('resize', reposition);
					window.addEventListener('scroll', reposition, true);
					return function () {
						if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
						document.removeEventListener('pointerdown', onPointerDown, true);
						document.removeEventListener('keydown', onKeyDown);
						window.removeEventListener('resize', reposition);
						window.removeEventListener('scroll', reposition, true);
					};
				},
				[open]
			);

			const refresh = function (event) {
				try {
					if (event !== null && event !== undefined && typeof event.stopPropagation === 'function') {
						event.stopPropagation();
					}
				} catch (error) {
					// a non-DOM event target still refreshes
				}
				setTick(function (previous) {
					return previous + 1;
				});
			};

			// Nothing readable for this account: no cell at all.
			if (snapshot === null || snapshot === undefined) return null;

			const t = copy();
			const isBalance = snapshot.kind === 'balance';
			const balance = isBalance ? selectCurrency(snapshot, currencyChoice) : null;
			const credits = isBalance ? null : snapshot.credits;
			if (isBalance && balance === null) return null;
			if (!isBalance && (credits === null || credits === undefined)) return null;

			// The paid wallet leads; a wallet that only holds a grant shows the grant
			// rather than a bare zero.
			const total = isBalance
				? balance.amount > 0
					? balance.amount
					: balance.bonus
				: Number(credits.total);
			if (!Number.isFinite(total)) return null;
			const headline = isBalance ? moneyText(balance.currency, total) : compactText(total);
			if (headline === null) return null;

			const label = isBalance ? t.titleBalance : t.title;
			const detail = isBalance ? t.detailBalance : t.detail;
			const providerName = providerKey === null ? null : providerKey.split(KEY_SEPARATOR)[0];
			const modelName = providerKey === null ? null : providerKey.split(KEY_SEPARATOR)[1];

			let panel = null;
			if (open && typeof document !== 'undefined') {
				try {
					const items = [];
					let heroUnit = t.unit;
					let heroMeta = null;

					if (isBalance) {
						heroUnit = balance.currency;
						const rows = summarizeWallets(snapshot);
						for (let index = 0; index < rows.length; index += 1) {
							const row = rows[index];
							const selected = row.currency === balance.currency;
							const sub = [];
							if (row.bonus > 0) {
								sub.push(t.bonus + ' ' + (moneyText(row.currency, row.bonus) ?? ''));
							}
							if (selected) sub.push(t.current);
							items.push(
								React.createElement(
									'li',
									{
										className: 'dshcred_item',
										key: 'wallet-' + row.currency,
										'data-current': String(selected)
									},
									React.createElement(
										'div',
										{ className: 'dshcred_itemTop' },
										React.createElement(
											'span',
											{ className: 'dshcred_itemName' },
											currencyName(row.currency, t)
										),
										React.createElement(
											'span',
											{ className: 'dshcred_itemValue' },
											moneyText(row.currency, row.amount) ?? ''
										)
									),
									sub.length === 0
										? null
										: React.createElement(
												'div',
												{ className: 'dshcred_itemSub' },
												sub.map(function (line, lineIndex) {
													return React.createElement('span', { key: 'sub-' + lineIndex }, line);
												})
											)
								)
							);
						}
					} else {
						const packages = Array.isArray(credits.packages) ? credits.packages : [];
						const nearest = dateText(credits.nearestExpiryMs);
						heroMeta = nearest === null ? null : t.nearest + ' ' + nearest;
						for (let index = 0; index < packages.length; index += 1) {
							const item = packages[index];
							if (item === null || item === undefined) continue;
							const remain = amountText(item.remain);
							if (remain === null) continue;
							const size = amountText(item.size);
							const expiry = dateText(item.expiresAtMs ?? item.cycleRefreshMs);
							const sub = [];
							if (item.monthly === true) sub.push(t.monthly);
							if (expiry !== null) sub.push(t.expires + ' ' + expiry);
							items.push(
								React.createElement(
									'li',
									{ className: 'dshcred_item', key: 'pkg-' + index },
									React.createElement(
										'div',
										{ className: 'dshcred_itemTop' },
										React.createElement(
											'span',
											{ className: 'dshcred_itemName' },
											typeof item.packageName === 'string' && item.packageName.length > 0
												? item.packageName
												: t.pkg
										),
										React.createElement(
											'span',
											{ className: 'dshcred_itemValue' },
											size === null ? remain : remain + ' / ' + size
										)
									),
									sub.length === 0
										? null
										: React.createElement(
												'div',
												{ className: 'dshcred_itemSub' },
												sub.map(function (line, lineIndex) {
													return React.createElement('span', { key: 'sub-' + lineIndex }, line);
												})
											)
								)
							);
						}
					}

					// The account answers in several currencies, so the reader picks which
					// one the cell leads with. `auto` hands the decision back to the region.
					const currencyPicker = isBalance
						? React.createElement(
								'div',
								{ className: 'dshcred_picker', role: 'group', 'aria-label': t.currency },
								React.createElement('span', { className: 'dshcred_pickerLabel' }, t.currency),
								[
									{ value: 'auto', text: t.auto },
									{ value: 'CNY', text: CURRENCY_SIGNS.CNY + ' ' + t.cny },
									{ value: 'USD', text: CURRENCY_SIGNS.USD + ' ' + t.usd }
								].map(function (option) {
									const active = currencyChoice === option.value;
									return React.createElement(
										'button',
										{
											type: 'button',
											key: 'currency-' + option.value,
											className: 'dshcred_pick',
											'data-active': String(active),
											'aria-pressed': String(active),
											onClick: function (event) {
												event.stopPropagation();
												setCurrencyChoice(option.value);
												writeCurrencyPreference(option.value);
											}
										},
										option.text
									);
								})
							)
						: null;

					const body = React.createElement(
						'div',
						{
							ref: panelRef,
							className: 'dshcred_panel',
							role: 'dialog',
							'aria-label': detail,
							style: position === null ? MEASURE_STYLE : position
						},
						React.createElement(
							'div',
							{ className: 'dshcred_header' },
							creditsIcon(),
							React.createElement('span', { className: 'dshcred_title' }, detail),
							React.createElement(
								'button',
								{
									type: 'button',
									className: 'dshcred_refresh',
									'data-busy': String(busy),
									'aria-label': t.refresh,
									title: t.refresh,
									onClick: refresh
								},
								refreshIcon()
							),
							React.createElement(
								'button',
								{
									type: 'button',
									className: 'dshcred_close',
									'aria-label': 'close',
									onClick: function () {
										setOpen(false);
									}
								},
								'×'
							)
						),
						React.createElement(
							'div',
							{ className: 'dshcred_body' },
							React.createElement(
								'div',
								{ className: 'dshcred_hero' },
								React.createElement(
									'span',
									{ className: 'dshcred_heroValue' },
									isBalance ? (moneyText(balance.currency, total) ?? headline) : amountText(total) ?? headline
								),
								React.createElement('span', { className: 'dshcred_heroUnit' }, heroUnit),
								heroMeta === null
									? null
									: React.createElement('span', { className: 'dshcred_heroMeta' }, heroMeta)
							),
							currencyPicker,
							items.length === 0
								? React.createElement('div', { className: 'dshcred_itemSub' }, isBalance ? t.bonusEmpty : t.empty)
								: React.createElement('ul', { className: 'dshcred_list' }, items)
						),
						React.createElement(
							'div',
							{ className: 'dshcred_foot' },
							React.createElement(
								'span',
								null,
								t.source +
									' ' +
									(providerName === null ? '—' : providerName) +
									(modelName === null || modelName === '' ? '' : ' / ' + modelName)
							),
							React.createElement(
								'span',
								null,
								t.refreshed + ' ' + (dateText(snapshot.updatedAt) ?? '')
							)
						)
					);
					panel = createPortal === null ? body : createPortal(body, document.body);
				} catch (error) {
					reportOnce('panel', 'detail panel failed, cell kept: ' + describeError(error));
					panel = null;
				}
			}

			return React.createElement(
				'div',
				{ className: 'dshcred_root', 'data-rail': String(!wide), 'data-credit-compass': true, ref: rootRef },
				React.createElement('style', null, CSS),
				React.createElement(
					'button',
					{
						type: 'button',
						className: 'dshcred_button',
						'aria-haspopup': 'dialog',
						'aria-expanded': open,
						'aria-label': label + ' ' + headline,
						title: wide ? undefined : label + ' ' + headline,
						onClick: function () {
							setOpen(!open);
						}
					},
					creditsIcon(),
					React.createElement('span', { className: 'dshcred_label' }, label),
					React.createElement('span', { className: 'dshcred_value' }, headline)
				),
				React.createElement(
					'button',
					{
						type: 'button',
						className: 'dshcred_refresh',
						'data-busy': String(busy),
						'aria-label': t.refresh,
						title: t.refresh,
						onClick: refresh
					},
					refreshIcon()
				),
				panel
			);
		}

		/**
		 * Register the cell. The reads live inside the component because the cell owns
		 * its own refresh cadence; `apply` only declares the slot occupant and hands it
		 * the two lookups it needs (services and, through the slot owner, session state).
		 *
		 * @param {any} ctx
		 * @param {any} config
		 */
		function apply(ctx, config) {
			void config;
			try {
				ctx.slots.inject(SLOT, function () {
					// This callback runs inside the slot owner's `register()` call: never let a
					// throw escape, or the whole application's startup is refused.
					try {
						return ctx.slots.register(
							{
								name: SLOT,
								id: SLOT_ID,
								order: SLOT_ORDER,
								inject: function () {
									return {
										getService: function (name) {
											try {
												return ctx.get(name);
											} catch (error) {
												return undefined;
											}
										}
									};
								}
							},
							CreditsCell
						);
					} catch (error) {
						reportOnce('slot', 'slot registration failed: ' + describeError(error));
						return function dispose() {};
					}
				});
			} catch (error) {
				reportOnce('slot-wait', 'slot wait failed: ' + describeError(error));
			}
		}

		exports.apply = apply;
		exports.inject = ['slots'];
	}
})();
