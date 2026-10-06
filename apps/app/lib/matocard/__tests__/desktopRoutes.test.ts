import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { desktopTarget, FLOW_ROUTES, rendersOnDesktop } from "../desktopRoutes";

/** Every `page.tsx` directly under `app/(flow)`, read off disk, so a new route cannot be forgotten. */
const FLOW_DIR = join(__dirname, "../../../app/(flow)");
const onDisk = readdirSync(FLOW_DIR)
  .filter((d) => statSync(join(FLOW_DIR, d)).isDirectory() && !d.startsWith("__"))
  .map((d) => `/${d}`)
  .sort();

test("every (flow) route on disk renders on desktop, and the list names nothing else", () => {
  expect([...FLOW_ROUTES].sort()).toEqual(onDisk);
});

test.each(FLOW_ROUTES)("%s renders in place", (path) => {
  expect(rendersOnDesktop(path)).toBe(true);
  expect(desktopTarget(path)).toBeNull();
});

test("an unknown path still lands somewhere rather than rendering nothing", () => {
  expect(desktopTarget("/nonsense")).toBe("/home");
});
