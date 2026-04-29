import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceBar } from "@/components/dialogue/WorkspaceBar";

describe("WorkspaceBar", () => {
  it("renders the current workspace and recent list", () => {
    render(
      <WorkspaceBar
        currentWorkspaceId="workspace_current"
        currentTitle="Current Workspace"
        items={[
          {
            id: "workspace_current",
            title: "Current Workspace",
            createdAt: "2026-04-25T12:00:00.000Z",
            updatedAt: "2026-04-25T12:00:00.000Z",
            lastOpenedAt: "2026-04-27T12:00:00.000Z",
            nodeCount: 2,
            entryCount: 1,
            focusedNodeId: "node_current"
          },
          {
            id: "workspace_other",
            title: "Other Workspace",
            createdAt: "2026-04-24T12:00:00.000Z",
            updatedAt: "2026-04-24T12:00:00.000Z",
            lastOpenedAt: "2026-04-26T12:00:00.000Z",
            nodeCount: 1,
            entryCount: 1,
            focusedNodeId: "node_other"
          }
        ]}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
      />
    );

    expect(
      screen.getByText("Current Workspace", { selector: "strong" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Other Workspace" })).toBeInTheDocument();
  });

  it("calls onCreate when creating a workspace", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    render(
      <WorkspaceBar
        currentWorkspaceId="workspace_current"
        currentTitle="Current Workspace"
        items={[]}
        onCreate={onCreate}
        onSelect={vi.fn()}
        onRename={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "新建工作区" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("calls onSelect when switching to another workspace", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <WorkspaceBar
        currentWorkspaceId="workspace_current"
        currentTitle="Current Workspace"
        items={[
          {
            id: "workspace_other",
            title: "Other Workspace",
            createdAt: "2026-04-24T12:00:00.000Z",
            updatedAt: "2026-04-24T12:00:00.000Z",
            lastOpenedAt: "2026-04-26T12:00:00.000Z",
            nodeCount: 1,
            entryCount: 1,
            focusedNodeId: "node_other"
          }
        ]}
        onCreate={vi.fn()}
        onSelect={onSelect}
        onRename={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Other Workspace" }));

    expect(onSelect).toHaveBeenCalledWith("workspace_other");
  });

  it("calls onRename with the edited title", async () => {
    const user = userEvent.setup();
    const onRename = vi.fn();

    render(
      <WorkspaceBar
        currentWorkspaceId="workspace_current"
        currentTitle="Current Workspace"
        items={[]}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRename={onRename}
      />
    );

    await user.click(screen.getByRole("button", { name: "重命名工作区" }));
    await user.clear(screen.getByLabelText("工作区名称"));
    await user.type(screen.getByLabelText("工作区名称"), "Renamed Workspace");
    await user.click(screen.getByRole("button", { name: "保存工作区名称" }));

    expect(onRename).toHaveBeenCalledWith("Renamed Workspace");
  });
});
