# CLAUDE.md - Anicca Project Guide

## Knowledge Graph (REQUIRED)

This project maintains a [graphify](https://github.com/safishamsi/graphify) knowledge graph at `graphify-out/`. **All agents MUST use the graph before exploring the codebase.**

### Before You Start

```bash
# Check if graph exists
ls graphify-out/graph.json

# If missing, build it first
/graphify
```

### Agent Workflow

1. **Query the graph first** - Always use `/graphify query` to understand the codebase structure
2. **Find relevant communities** - Check GRAPH_REPORT.md for community hubs
3. **Trace connections** - Use `/graphify path` to understand cross-module relationships
4. **Read source files** - Only after understanding the graph context
5. **Update after changes** - Run `/graphify --update` after significant refactoring

### Essential Commands

```bash
# Query concepts
/graphify query "impermanence"
/graphify query "how does rendering connect to state"

# Find paths between modules
/graphify path "Core" "Renderer"

# Explain specific nodes
/graphify explain "AniccaEngine"

# Update after code changes
/graphify --update
```

### Graph Structure

- **684 nodes** - Functions, classes, concepts
- **908 edges** - Import, call, semantic relationships
- **176 communities** - Logical clusters
- **216 files** indexed

_Last updated: 2026-05-13_

### When to Use the Graph

| Task | Graph Tool | Example |
|------|-----------|---------|
| Understand module relationships | `query` | `/graphify query "how modules connect"` |
| Find cross-module dependencies | `path` | `/graphify path "Core" "UI"` |
| Locate specific functionality | `query` | `/graphify query "state management"` |
| Understand a component | `explain` | `/graphify explain "AniccaEngine"` |
| After refactoring | `--update` | `/graphify --update` |

### Outputs Location

- `graphify-out/graph.json` - Raw graph data
- `graphify-out/GRAPH_REPORT.md` - Full audit report
- `graphify-out/obsidian/` - Visual exploration vault

## Agent Rules

1. **Graph First**: Always query the graph before reading source files
2. **Community Aware**: Note which community a file belongs to
3. **Cross-Module Care**: Use `/graphify path` to check blast radius
4. **Update Graph**: Run `--update` after structural changes
5. **Check God Nodes**: High-centrality nodes are critical - modify with care

## Documentation

- [README](README.md) - Project overview
- [GRAPH_REPORT](graphify-out/GRAPH_REPORT.md) - Knowledge graph audit

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
