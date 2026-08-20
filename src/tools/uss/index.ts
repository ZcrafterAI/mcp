/**
 * Unix files (USS).
 *
 * Browse and read the Unix side of z/OS — ordinary directories and files.
 */
import type { Tool } from '../define-tool.js';
import { listUssDirectoryTool } from './list-directory.js';
import { readUssFileTool } from './read-file.js';
import { searchUssFilesTool } from './search-files.js';

export const ussTools: Tool[] = [listUssDirectoryTool, readUssFileTool, searchUssFilesTool];
