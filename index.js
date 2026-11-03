/**
 * Host half of `dsh-credit-compass`.
 *
 * The whole plugin is the browser half: it is one cell in the sidebar foot that
 * reads the WorkBuddy credit route and paints the remaining amount. A Host row
 * still exists because `dsh-client-modules` attaches a package's `dsh.client`
 * declaration to the Loader row whose specifier is the bare package name.
 *
 * The deployment treats a single failed activation as a refused startup, so the
 * body stays free of anything that can throw.
 *
 * @module dsh-credit-compass
 */

export const name = 'dsh-credit-compass'

/** Contribute nothing Host-side. */
export function apply(ctx) {
  void ctx
}
