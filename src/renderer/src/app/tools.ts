// The tool registry: the one place that knows which tools exist.
import { imagesTool } from '../features/images/tool.ts';
import { libraryTool } from '../features/library/tool.ts';
import { markdownTool } from '../features/markdown/tool.ts';
import { mediaTool } from '../features/media/tool.ts';
import { passwordsTool } from '../features/passwords/tool.ts';
import { pdfTool } from '../features/pdf/tool.ts';
import { qrTool } from '../features/qr/tool.ts';
import { recordTool } from '../features/recording/tool.ts';
import { transcribeTool } from '../features/transcription/tool.ts';
import type { FileKind } from '../../../shared/files.ts';
import type { FileAction, ToolDefinition, ToolGroup } from './tool-definition.ts';

export const TOOLS: ToolDefinition[] = [imagesTool, mediaTool, pdfTool, markdownTool, transcribeTool, recordTool, libraryTool, passwordsTool, qrTool];

export const TOOL_GROUPS: ToolGroup[] = ['files', 'voice', 'utilities'];

export const toolsInGroup = (group: ToolGroup) => TOOLS.filter((tool) => tool.group === group);

export const fileActionsFor = (kind: FileKind): FileAction[] => TOOLS.flatMap((tool) => tool.fileActions ?? []).filter((action) => (action.kinds as FileKind[]).includes(kind));
