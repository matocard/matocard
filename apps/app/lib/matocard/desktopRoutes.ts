/**
 * What desktop does with each `(flow)` route: render it in place, or send the visitor Home.
 *
 * **A route not listed silently vanishes.** `FlowLayout` falls through to `router.replace("/home")`,
 * so the screen never renders, nothing throws, and the button that led there looks like it did not
 * register. Every Matocard flow renders in place, so the list below is the whole of `(flow)`: a new
 * route goes in it, and in the test beside it, or it vanishes on desktop.
 *
 * It lives here rather than inside `layout.tsx` so it can be tested as a function.
 */

/** The `(flow)` routes, each rendered in place at desktop width, inside the flow column. */
export const FLOW_ROUTES = ["/send", "/topup", "/settle", "/cashout", "/transactions"] as const;

export function rendersOnDesktop(path: string): boolean {
  return (FLOW_ROUTES as readonly string[]).includes(path);
}

/** Where a desktop visitor on `path` should end up, or null to render in place. */
export function desktopTarget(path: string): string | null {
  return rendersOnDesktop(path) ? null : "/home";
}
