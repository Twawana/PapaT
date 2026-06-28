import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

export async function copyPathToClipboard(path: string): Promise<void> {
  await Clipboard.setStringAsync(path);
  await Haptics.selectionAsync();
}
