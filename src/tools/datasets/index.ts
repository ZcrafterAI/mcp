/**
 * Dataset tools registration.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { registerListDatasetsTool } from './list-datasets.js';
import { registerReadDatasetTool } from './read-dataset.js';
import { registerSearchDatasetTool } from './search-dataset.js';
import { registerSearchMembersTool } from './search-members.js';
import { registerDatasetInfoTool } from './dataset-info.js';
export const registerDatasetTools: ToolRegistrar = (server, ctx) => {
    registerListDatasetsTool(server, ctx);
    registerReadDatasetTool(server, ctx);
    registerSearchDatasetTool(server, ctx);
    registerSearchMembersTool(server, ctx);
    registerDatasetInfoTool(server, ctx);
    ctx.logger.debug('Registered dataset tools');
};
export * from './shared.js';
