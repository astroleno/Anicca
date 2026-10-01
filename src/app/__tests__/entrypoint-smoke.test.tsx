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
import MochiPage from "@/app/mochi/page";
import RaymarchingPage from "@/app/raymarching/page";
import LiquidPage from "@/app/liquid/page";
import NewframeLabPage from "@/app/labs/newframe/page";

describe("entrypoint smoke", () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it("redirects the root route to /dialogue", () => {
    HomePage();

    expect(redirectMock).toHaveBeenCalledWith("/dialogue");
  });

  it.each([
    ["newframe", NewframePage],
    ["mochi", MochiPage],
    ["raymarching", RaymarchingPage],
    ["liquid", LiquidPage]
  ] as const)("redirects the legacy %s route into labs", (name, Page) => {
    Page();
    expect(redirectMock).toHaveBeenCalledWith(`/labs/${name}`);
  });

  it("keeps the experiment canvas and navigation in labs", () => {
    render(<NewframeLabPage />);

    expect(screen.getByText("旧实验入口")).toBeInTheDocument();
    expect(screen.getByText(/新的正反合主线已经迁移到 `\/dialogue`/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往 /dialogue" })).toHaveAttribute("href", "/dialogue");
    expect(screen.getByTestId("legacy-metaball-canvas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "全部实验" })).toHaveAttribute("href", "/labs");
    expect(screen.getByRole("link", { name: "返回对话" })).toHaveAttribute("href", "/dialogue");
  });
});
