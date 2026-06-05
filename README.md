# Isekai

Desktop Sky: Children of the Light clock and planner built with Tauri 2,
React, Rust, shadcn/ui, and Tailwind CSS.

The app is Windows-first and includes:

- Sky-time aware recurring event countdowns using `America/Los_Angeles`
- A passive transparent overlay window with global hotkey toggles
- Sidebar-first dashboard, calendar, goals, collection, overlay, and settings pages
- Light, dark, and system theme modes
- Local planner storage for goals and wishlist state

## Product Demo

![Isekai product demo](assets/product-demo.gif)

[View MP4 demo](assets/export-1780652649327.mp4)

## Development

```bash
bun install
bun run test
bun run build
cd src-rs && cargo check
```

Run the desktop app during development:

```bash
bun tauri dev
```

## Tech Stack

- Desktop: Tauri 2 and Rust
- UI: React 19, TypeScript, Vite, shadcn/ui, Radix UI, lucide-react, and Tailwind CSS
- Time: `@js-temporal/polyfill` and `date-fns`
- Data: [`skygame-data`](https://www.npmjs.com/package/skygame-data)

Sky: Children of the Light is by thatgamecompany. This project is unofficial.
