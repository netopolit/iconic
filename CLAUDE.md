# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Iconic is an Obsidian plugin that lets users customize icons and colors for UI elements (tabs, files, folders, bookmarks, tags, properties, ribbon commands) using Lucide icons and emojis.

## Build Commands

- `npm run dev` — Watch mode with inline sourcemaps (esbuild), hot-reloads in Obsidian
- `npm run build` — Type-check (`tsc -noEmit -skipLibCheck`) then bundle for production
- `npx eslint src/` — Lint source files

No test framework is configured. Type-checking via `tsc` is the primary automated safety net.

## Code Style

- Tabs (width 4), single quotes (ESLint-enforced), LF line endings
- ESLint v9 flat config: `ban-ts-comment` off (needed for Obsidian private APIs), `prefer-const` off

## Obsidian Plugin Conventions

- The plugin extends `Plugin` and must clean up everything in `onunload()` — remove event listeners, mutation observers, and DOM modifications
- Use `this.registerEvent()`, `this.registerDomEvent()`, and `this.register()` for automatic cleanup on plugin unload
- Use `this.addCommand()` to register commands; Obsidian handles their lifecycle
- Settings are persisted via `this.loadData()` / `this.saveData()` — these read/write `data.json`
- Use Obsidian's `setIcon(el, iconId)` to render Lucide icons into DOM elements
- Modals extend `Modal` and implement `onOpen()` / `onClose()`
- The settings tab extends `PluginSettingTab` with `display()` to render settings UI
- Access to Obsidian internal APIs uses `@ts-expect-error` — these are fragile and may break across updates
- The plugin runs on both desktop and mobile; use `Platform.isDesktop` / `Platform.isMobile` for branching
- `manifest.json` declares plugin metadata and minimum Obsidian version (currently 1.11.0)
- Build output is `main.js` (CJS, ES2021 target) in the project root; distributed alongside `manifest.json` and `styles.css`

## Architecture

### Entry Point

`src/IconicPlugin.ts` — Main plugin class. Handles lifecycle (`onload`/`onunload`), settings persistence, vault events, command registration, and orchestrates all managers.

### Manager Pattern

Specialized **IconManager** subclasses in `src/managers/` each handle a distinct UI area: `AppIconManager` (title bar buttons), `TabIconManager`, `FileIconManager`, `EditorIconManager` (inline titles), `BookmarkIconManager`, `TagIconManager`, `PropertyIconManager`, `RibbonIconManager`, `SuggestionIconManager` (quick switcher), `SuggestionDialogIconManager`. The base class `IconManager.ts` provides:
- `refreshIcon()` — renders an icon/emoji with optional color into a DOM element
- `changeIconItem()` / `removeIconItem()` / `editRuleItem()` — shared menu item callbacks used by all managers
- `setContextMenu()` — guards a contextmenu listener behind the `showMenuActions` setting
- `refreshFolderSidekick()` — manages the sidekick icon for folders (used by File and Bookmark managers)
- Event listener and MutationObserver lifecycle management (auto-cleanup on unload)

`IconicPlugin.openIconPicker()` handles single/multi-item branching for the icon picker dialog, used by all managers instead of calling `IconPicker` directly.

Support managers:
- `MenuManager` — Intercepts context menus via Proxy pattern to inject "Change icon" items
- `RuleManager` — Evaluates conditional rules for automated file/folder icons. Per-item icons/colors take priority over rules (act as exceptions); rule evaluation is skipped when an item has an explicit icon or color
- `IconPackManager` — Manages icon pack installation and removal

### Dialogs (`src/dialogs/`)

Modals for icon selection (`IconPicker`), icon pack browsing (`IconPackBrowser`), rule management (`RulePicker`, `RuleEditor`), and rule testing (`RuleChecker`). All dialogs use `DialogIconManager` (exported from `IconManager.ts`) for DOM operations and `IconicPlugin.registerDialogHotkeys(scope)` for hotkey registration.

### Components (`src/components/`)

Reusable UI components: `ConditionSetting`, `ConditionValueSuggest`, `RuleNameSuggest`, `RuleSetting` — used by the rule editor dialogs.

### Data Modules

- `src/Emojis.ts` — Emoji dataset
- `src/IconPacks.ts` — Icon pack metadata and utilities

### Strings

`src/Strings.ts` — Static class with all user-facing strings as properties (English only). Placeholders: `{#}` for numbers, `{text}` for strings.

### Key Patterns

- **Private APIs**: Accessed via `@ts-expect-error` — fragile across Obsidian updates
- **DOM lifecycle**: All MutationObservers and event listeners are tracked per-manager and cleaned up on unload
- **Debouncing**: `FileIconManager` batches refresh calls with timers for rapid vault changes
- **Backup system**: Automatic rolling backups of `data.json` with corruption detection
