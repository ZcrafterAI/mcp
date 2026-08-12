/**
 * Db2 tools registration.
 */
import type { ToolRegistrar } from '../../types/tools.js';
import { registerListDb2SubsystemsTool } from './list-subsystems.js';
import { registerSearchDb2CatalogTool } from './search-catalog.js';
export const registerDb2Tools: ToolRegistrar = (server, ctx) => {
    registerListDb2SubsystemsTool(server, ctx);
    registerSearchDb2CatalogTool(server, ctx);
    ctx.logger.debug('Registered Db2 tools');
};
