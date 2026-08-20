/**
 * Db2 databases.
 *
 * Look up what tables and views exist in the mainframe's Db2 databases.
 */
import type { Tool } from '../define-tool.js';
import { listDb2SubsystemsTool } from './list-subsystems.js';
import { searchDb2CatalogTool } from './search-catalog.js';

export const db2Tools: Tool[] = [listDb2SubsystemsTool, searchDb2CatalogTool];
