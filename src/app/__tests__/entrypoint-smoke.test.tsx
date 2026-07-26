import type { AnchorHTMLAttributes } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    const MockCanvas = () => <div data-testid="legacy-metaball-canvas" />;
    return MockCanvas;
  }
}));

import HomePage from "@/app/page";
import NewframePage from "@/app/newframe/page";

describe("entrypoint smoke", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    window.history.replaceState({}, "", "/");
  });

  it("redirects the root route to /dialogue", () => {
    HomePage();

    expect(redirectMock).toHaveBeenCalledWith("/dialogue");
  });

  it("keeps /newframe as a clean visual experiment by default", () => {
    render(<NewframePage />);

    expect(screen.queryByRole("link", { name: "前往 /dialogue" })).not.toBeInTheDocument();
    expect(screen.getByTestId("legacy-metaball-canvas")).toBeInTheDocument();
  });

  it("shows /newframe lab UI when explicitly requested", async () => {
    window.history.replaceState({}, "", "/newframe?lab=1");

    render(<NewframePage />);

    expect(await screen.findByText("Visual Lab")).toBeInTheDocument();
    expect(screen.getByText("/newframe metaball")).toBeInTheDocument();
    expect(screen.getByText(/WebGPU \/ metaball 实验入口/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往 /dialogue" })).toHaveAttribute("href", "/dialogue");
    expect(screen.getByTestId("legacy-metaball-canvas")).toBeInTheDocument();
  });
});
