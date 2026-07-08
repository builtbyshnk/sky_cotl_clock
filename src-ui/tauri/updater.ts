import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isTauriRuntime } from "@/tauri/overlay";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "current"
  | "downloading"
  | "installing"
  | "installed"
  | "unsupported"
  | "error";

export interface AppUpdateState {
  status: UpdateStatus;
  currentVersion: string;
  latestVersion: string | null;
  releaseDate: string | null;
  releaseNotes: string;
  progress: number | null;
  downloadedBytes: number;
  contentLength: number | null;
  error: string;
}

export const initialUpdateState: AppUpdateState = {
  status: "idle",
  currentVersion: "",
  latestVersion: null,
  releaseDate: null,
  releaseNotes: "",
  progress: null,
  downloadedBytes: 0,
  contentLength: null,
  error: "",
};

export type UpdateStatePatch = Partial<AppUpdateState>;

interface GitHubRelease {
  body?: string | null;
  published_at?: string | null;
}

async function fetchReleaseNotesForVersion(version: string) {
  if (isTauriRuntime()) {
    return invoke<Pick<AppUpdateState, "releaseDate" | "releaseNotes">>(
      "fetch_release_notes_for_version",
      { version },
    );
  }

  const releaseTags = [`v${version}`];

  for (const tag of releaseTags) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/builtbyshnk/sky_cotl_clock/releases/tags/${encodeURIComponent(tag)}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
          },
        },
      );

      if (!response.ok) {
        continue;
      }

      const release = (await response.json()) as GitHubRelease;
      return {
        releaseDate: release.published_at ?? null,
        releaseNotes: release.body?.trim() || "",
      };
    } catch {
      continue;
    }
  }

  return {
    releaseDate: null,
    releaseNotes: "",
  };
}

export async function checkForAppUpdate(
  setState: (patch: UpdateStatePatch) => void,
): Promise<Update | null> {
  if (!isTauriRuntime()) {
    setState({
      status: "unsupported",
      error: "App updates are available only in the installed desktop app.",
    });
    return null;
  }

  setState({ status: "checking", error: "", progress: null });

  try {
    const [currentVersion, update] = await Promise.all([
      getVersion(),
      check({ timeout: 30000 }),
    ]);

    if (!update) {
      const currentRelease = await fetchReleaseNotesForVersion(currentVersion);
      setState({
        status: "current",
        currentVersion,
        latestVersion: null,
        releaseDate: currentRelease.releaseDate,
        releaseNotes: currentRelease.releaseNotes,
      });
      return null;
    }

    setState({
      status: "available",
      currentVersion: update.currentVersion || currentVersion,
      latestVersion: update.version,
      releaseDate: update.date ?? null,
      releaseNotes: update.body ?? "",
    });

    return update;
  } catch (error) {
    setState({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function installAppUpdate(
  update: Update,
  setState: (patch: UpdateStatePatch) => void,
) {
  let downloadedBytes = 0;
  let contentLength: number | null = null;

  setState({
    status: "downloading",
    error: "",
    progress: 0,
    downloadedBytes: 0,
    contentLength: null,
  });

  try {
    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        contentLength = event.data.contentLength || null;
        setState({
          status: "downloading",
          contentLength,
          progress: contentLength ? 0 : null,
        });
      }

      if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        setState({
          downloadedBytes,
          progress: contentLength
            ? Math.min(downloadedBytes / contentLength, 1)
            : null,
        });
      }

      if (event.event === "Finished") {
        setState({ status: "installing", progress: 1 });
      }
    });

    setState({ status: "installed", progress: 1 });
  } catch (error) {
    setState({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
