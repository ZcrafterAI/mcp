/**
 * `list_db2_subsystems` — list the Db2 locations reachable through Db2 REST.
 */
import { defineTool } from '../define-tool.js';
import { renderTable, textResult } from '../../utils/formatters.js';
import { listDb2Subsystems } from './shared.js';

export const listDb2SubsystemsTool = defineTool({
    name: 'list_db2_subsystems',
    description: 'List Db2 subsystems (locations) available via Db2 REST (requires DB2_LOCATION).',
    input: {},
    async run(_args, ctx) {
        const locations = await listDb2Subsystems(ctx);
        ctx.logger.debug({ count: locations.length }, 'list_db2_subsystems');
        const rows = locations.map((loc) => [loc, 'AVAILABLE']);
        return textResult(
            `Db2 Subsystems (${locations.length} found)\n\n` +
                renderTable(['Location', 'Status'], rows),
        );
    },
});
