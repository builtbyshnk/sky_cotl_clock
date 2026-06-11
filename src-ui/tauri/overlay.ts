import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { emitTo } from "@tauri-apps/api/event";
import {
  getAllWindows,
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
  primaryMonitor,
} from "@tauri-apps/api/window";
import type { AppSettings } from "@/domain/types";

const OVERLAY_WIDTH = 360;
const OVERLAY_HEADER_HEIGHT = 58;
const OVERLAY_ROW_HEIGHT = 76;
const OVERLAY_ROW_GAP = 8;
const OVERLAY_ROUTE_CARD_HEIGHT = 150;
const OVERLAY_ROUTE_TEXT_HEIGHT = 74;
const OVERLAY_MARGIN = 24;
const OVERLAY_EXIT_MS = 180;

function clampOverlayRows(settings: AppSettings) {
  return Math.min(8, Math.max(3, settings.overlay.maxEvents));
}

function overlaySize(settings: AppSettings) {
  const rows = clampOverlayRows(settings);
  const clockHeight =
    OVERLAY_HEADER_HEIGHT +
    rows * OVERLAY_ROW_HEIGHT +
    Math.max(0, rows - 1) * OVERLAY_ROW_GAP;
  const miniMapHeight =
    OVERLAY_HEADER_HEIGHT +
    Math.round(settings.overlay.miniMap.size * 0.75) +
    OVERLAY_ROUTE_TEXT_HEIGHT +
    OVERLAY_ROW_GAP * 3;
  const routeHeight =
    OVERLAY_HEADER_HEIGHT + OVERLAY_ROUTE_CARD_HEIGHT + OVERLAY_ROW_GAP;
  const clockRouteRows = 2;
  const clockRouteHeight =
    OVERLAY_HEADER_HEIGHT +
    clockRouteRows * OVERLAY_ROW_HEIGHT +
    Math.max(0, clockRouteRows - 1) * OVERLAY_ROW_GAP +
    Math.round(settings.overlay.miniMap.size * 0.75) +
    OVERLAY_ROUTE_TEXT_HEIGHT +
    OVERLAY_ROW_GAP * 3;
  const height =
    settings.overlay.mode === "mini-map"
      ? Math.max(miniMapHeight, routeHeight)
      : settings.overlay.mode === "route"
        ? routeHeight
        : settings.overlay.mode === "clock-route"
          ? clockRouteHeight
          : clockHeight;

  return {
    width: Math.ceil(OVERLAY_WIDTH * settings.overlay.scale),
    height: Math.ceil(height * settings.overlay.scale),
  };
}

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function getWindowLabel(): Promise<string> {
  if (!isTauriRuntime()) {
    return "main";
  }

  return getCurrentWindow().label;
}

export async function configureOverlayWindow(settings: AppSettings) {
  if (!isTauriRuntime()) {
    return;
  }

  const current = getCurrentWindow();
  if (current.label !== "overlay") {
    return;
  }

  await current.setVisibleOnAllWorkspaces(true);
  await current.setAlwaysOnTop(true);
  await current.setIgnoreCursorEvents(settings.overlay.clickThrough);
  const size = overlaySize(settings);
  await current.setSize(new LogicalSize(size.width, size.height));
  await positionOverlay(settings);
}

export async function positionOverlay(settings: AppSettings) {
  if (!isTauriRuntime()) {
    return;
  }

  const overlay = await findWindow("overlay");
  const monitor = await primaryMonitor();

  if (!overlay || !monitor) {
    return;
  }

  const size = overlaySize(settings);
  await overlay.setSize(new LogicalSize(size.width, size.height));
  const workArea = monitor.workArea;
  const left = workArea.position.x;
  const top = workArea.position.y;
  const right = left + workArea.size.width;
  const bottom = top + workArea.size.height;
  const physicalWidth = Math.round(size.width * monitor.scaleFactor);
  const physicalHeight = Math.round(size.height * monitor.scaleFactor);
  const physicalMargin = Math.round(OVERLAY_MARGIN * monitor.scaleFactor);

  const x =
    settings.overlay.position === "top-left" ||
    settings.overlay.position === "bottom-left"
      ? left + physicalMargin
      : right - physicalWidth - physicalMargin;
  const y =
    settings.overlay.position === "bottom-left" ||
    settings.overlay.position === "bottom-right"
      ? bottom - physicalHeight - physicalMargin
      : top + physicalMargin;

  await overlay.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
}

export async function toggleOverlay(settings: AppSettings) {
  if (!settings.overlay.enabled) {
    return;
  }

  const overlay = await findWindow("overlay");

  if (!overlay) {
    return;
  }

  const visible = await overlay.isVisible();
  if (visible) {
    await emitTo("overlay", "sky-overlay-visibility", false);
    await new Promise((resolve) => window.setTimeout(resolve, OVERLAY_EXIT_MS));
    await overlay.hide();
    return;
  }

  await positionOverlay(settings);
  await overlay.setVisibleOnAllWorkspaces(true);
  await overlay.setAlwaysOnTop(true);
  await overlay.show();
  await emitTo("overlay", "sky-overlay-visibility", true);
}

export async function showOverlay(settings: AppSettings) {
  if (!settings.overlay.enabled) {
    return;
  }

  const overlay = await findWindow("overlay");

  if (!overlay) {
    return;
  }

  if (await overlay.isVisible()) {
    return;
  }

  await positionOverlay(settings);
  await overlay.setVisibleOnAllWorkspaces(true);
  await overlay.setAlwaysOnTop(true);
  await overlay.show();
  await emitTo("overlay", "sky-overlay-visibility", true);
}

export async function showMainWindow() {
  const main = await findWindow("main");

  if (!main) {
    return;
  }

  await main.show();
  await main.setFocus();
}

export async function registerAppHotkeys(
  settings: AppSettings,
  onError: (message: string) => void,
  routeActions?: {
    cycleOverlayMode: () => void;
    nextRouteTarget: () => void;
    previousRouteTarget: () => void;
    toggleRouteTargetComplete: () => void;
    toggleMiniMapExpanded: () => void;
  },
) {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await unregisterAll();
    const shortcuts = Array.from(
      new Set(
        [
          settings.hotkeys.toggleOverlay,
          settings.hotkeys.showMainWindow,
          settings.hotkeys.cycleOverlayMode,
          settings.hotkeys.nextRouteTarget,
          settings.hotkeys.previousRouteTarget,
          settings.hotkeys.toggleRouteTargetComplete,
          settings.hotkeys.toggleMiniMapExpanded,
        ].filter(Boolean),
      ),
    );

    await register(
      shortcuts,
      async (event) => {
        if (event.state !== "Pressed") {
          return;
        }

        if (event.shortcut === settings.hotkeys.toggleOverlay) {
          await toggleOverlay(settings);
        }

        if (event.shortcut === settings.hotkeys.showMainWindow) {
          await showMainWindow();
        }

        if (event.shortcut === settings.hotkeys.cycleOverlayMode) {
          routeActions?.cycleOverlayMode();
        }

        if (event.shortcut === settings.hotkeys.nextRouteTarget) {
          routeActions?.nextRouteTarget();
        }

        if (event.shortcut === settings.hotkeys.previousRouteTarget) {
          routeActions?.previousRouteTarget();
        }

        if (event.shortcut === settings.hotkeys.toggleRouteTargetComplete) {
          routeActions?.toggleRouteTargetComplete();
        }

        if (event.shortcut === settings.hotkeys.toggleMiniMapExpanded) {
          routeActions?.toggleMiniMapExpanded();
        }
      },
    );
    onError("");
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
  }
}

async function findWindow(label: string) {
  const windows = await getAllWindows();
  return windows.find((window) => window.label === label);
}
