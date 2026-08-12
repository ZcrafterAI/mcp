/**
 * USS tools registration.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { registerListDirectoryTool } from './list-directory.js';
import { registerReadFileTool } from './read-file.js';
import { registerSearchFilesTool } from './search-files.js';
export const registerUssTools: ToolRegistrar = (server, ctx) => {
    registerListDirectoryTool(server, ctx);
    registerReadFileTool(server, ctx);
    registerSearchFilesTool(server, ctx);
    ctx.logger.debug('Registered USS tools');
};
export * from './shared.js';
