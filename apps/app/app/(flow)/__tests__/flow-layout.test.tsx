import { render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import FlowLayout from "../layout";

const nav = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }));
const path = vi.hoisted(() => ({ current: "/topup" }));
vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => path.current }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
const useWallet = vi.fn();
vi.mock("../../../hooks/useWallet", () => ({ useWallet: () => useWallet() }));

function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((q: string) => ({
    matches,
    media: q,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  nav.replace.mockClear();
  path.current = "/topup";
  // jsdom has no matchMedia by default; useIsDesktop guards that and stays false (mobile).
  (window as { matchMedia?: unknown }).matchMedia = undefined;
});

test("mobile: flow layout renders children and no bottom nav", () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  render(
    <FlowLayout>
      <p>flow body</p>
    </FlowLayout>,
  );
  expect(screen.getByText("flow body")).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  expect(nav.replace).not.toHaveBeenCalled();
});

test("desktop: a Matocard flow renders in place", () => {
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  mockMatchMedia(true);
  render(
    <FlowLayout>
      <p>flow body</p>
    </FlowLayout>,
  );
  expect(screen.getByText("flow body")).toBeInTheDocument();
  expect(nav.replace).not.toHaveBeenCalled();
});

test("desktop: a path that is not a flow goes Home rather than rendering nothing", async () => {
  path.current = "/nonsense";
  useWallet.mockReturnValue({ isConnected: true, hydrated: true });
  mockMatchMedia(true);
  render(
    <FlowLayout>
      <p>flow body</p>
    </FlowLayout>,
  );
  await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/home"));
  expect(screen.queryByText("flow body")).toBeNull();
});
