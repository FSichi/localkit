// What a tool declares about itself. The sidebar and the home screen are built from these,
// so adding a tool only means writing its feature and listing it in tools.ts.
import type { ComponentType } from 'react';
import type { SupportedFileKind } from '../../../shared/files.ts';
import type { IconName } from '../ui/Icon.tsx';
import type { ToolId } from './app-store.ts';

export type ToolGroup = 'files' | 'voice' | 'utilities';

/** Something a tool offers to do with dropped files on the home screen. */
export interface FileAction {
  kinds: SupportedFileKind[];
  label: string;
  icon: IconName;
  run(paths: string[]): void;
}

export interface ToolDefinition {
  id: ToolId;
  group: ToolGroup;
  label: string;
  description: string;
  icon: IconName;
  Page: ComponentType;
  fileActions?: FileAction[];
}
