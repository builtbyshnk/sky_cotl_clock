# AGENTS.md

## Project

Isekai is a Tauri 2 desktop app for Sky: Children of the Light, built with React, TypeScript, Vite, Rust, Tailwind CSS, and shadcn/ui.

## Local Skills

Always use the project-installed shadcn skill before any shadcn/ui or component work:

`./.agents/skills/shadcn/SKILL.md`

Follow its linked rules in `./.agents/skills/shadcn/rules/`, especially composition, styling, forms, and icons. Prefer existing shadcn components in `src-ui/components/ui` before writing custom UI.

## Commands

- Install dependencies: `bun install`
- Run tests: `bun run test`
- Build app: `bun run build`
- Run desktop app: `bun tauri dev`
- Check Rust backend: `cd src-rs && cargo check`

## Structure

- `src-ui/` contains the React app.
- `src-ui/components/ui/` contains local shadcn/ui components.
- `src-ui/pages.tsx` contains the main page components.
- `src-rs/` contains the Tauri/Rust app.
- `docs/` contains the static website.

## UI Rules

- Use shadcn primitives such as `Button`, `Card`, `Tabs`, `Dialog`, `Input`, `Select`, `Switch`, `Badge`, `Separator`, and `Tooltip` when available.
- Keep `TabsTrigger` inside `TabsList`.
- Use full `Card` composition: `CardHeader`, `CardTitle`, `CardDescription`, and `CardContent`.
- Use semantic Tailwind tokens like `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, and `text-primary`.
- Use lucide icons consistently with the existing app.
- Avoid unrelated refactors and preserve user changes.

## Verification

After code changes, run the narrowest useful check. For UI or TypeScript changes, prefer `bun run build`.
