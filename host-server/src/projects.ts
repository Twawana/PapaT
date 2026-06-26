import { validateProjectPath, getBrowseRoots, listBrowseDirectory } from "./browse";
import { launchEditor, EditorId } from "./editor";
import { addRecentFolder, getRecentFolders } from "./recent-folders";
import { isVscodeConnected, openInVscode } from "./vscode-bridge";
import {
  getWorkspaceRoot,
  setWorkspaceRoot,
  workspaceFolderName,
} from "./workspace-state";

export async function openProject(
  folderPath: string,
  editor?: EditorId
): Promise<{ path: string; name: string; editor?: EditorId }> {
  const validated = validateProjectPath(folderPath);
  setWorkspaceRoot(validated);
  addRecentFolder(validated);

  if (editor === "vscode") {
    if (!isVscodeConnected()) {
      launchEditor("vscode", validated);
    } else {
      openInVscode(".", "open_folder");
    }
  } else if (editor === "cursor") {
    launchEditor("cursor", validated);
  } else if (isVscodeConnected()) {
    openInVscode(".", "open_folder");
  }

  return {
    path: validated,
    name: workspaceFolderName(),
    editor,
  };
}

export function getWorkspaceInfo(): { path: string; name: string } {
  const root = getWorkspaceRoot();
  return { path: root, name: workspaceFolderName() };
}

export function getWorkspaceRecent(): {
  current: string;
  recent: ReturnType<typeof getRecentFolders>;
} {
  return {
    current: getWorkspaceRoot(),
    recent: getRecentFolders(),
  };
}

export { getBrowseRoots, listBrowseDirectory };
