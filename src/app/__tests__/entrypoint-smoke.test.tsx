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
  });

  it("redirects the root route to /dialogue", () => {
    HomePage();

    expect(redirectMock).toHaveBeenCalledWith("/dialogue");
  });

  it("marks /newframe as a legacy experiment and links back to /dialogue", () => {
    render(<NewframePage />);

    expect(screen.getByText("旧实验入口")).toBeInTheDocument();
    expect(screen.getByText(/新的正反合主线已经迁移到 `\/dialogue`/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往 /dialogue" })).toHaveAttribute("href", "/dialogue");
    expect(screen.getByTestId("legacy-metaball-canvas")).toBeInTheDocument();
  });
});
