# Isekai

Desktop Sky: Children of the Light clock and planner built with Tauri 2,
React, Rust, shadcn/ui, and Tailwind CSS.

The app is Windows-first and includes:

- Sky-time aware recurring event countdowns using `America/Los_Angeles`
- A passive transparent overlay window with global hotkey toggles
- Sidebar-first dashboard, calendar, goals, collection, overlay, and settings pages
- Light, dark, and system theme modes
- Local planner storage for goals and wishlist state

Source: https://github.com/radcolor-dev/sky_cotl_clock

## Product Demo

<div align="center">

https://github.com/user-attachments/assets/c1aa4cb3-f4ac-4f88-bf0a-91947119247c

</div>

[View MP4 demo](assets/export-1780652649327.mp4)

## Support

For questions, feedback, and release support, message on Telegram:
https://t.me/radcolordev

If Isekai helps you and you want to support the work, you can donate here:
https://radcolor.dev/donate

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
