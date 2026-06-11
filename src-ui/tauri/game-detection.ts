import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/tauri/overlay";

export async function isGameProcessRunning(processNames: string[]) {
  if (!isTauriRuntime() || processNames.length === 0) {
    return false;
  }

  return invoke<boolean>("is_process_running", { processNames });
}
