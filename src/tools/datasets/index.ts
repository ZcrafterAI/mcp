/**
 * Datasets.
 *
 * Find and read the mainframe equivalent of files and folders: sequential
 * datasets, partitioned datasets (PDS), and their members.
 */
import type { Tool } from '../define-tool.js';
import { listDatasetsTool } from './list-datasets.js';
import { readDatasetTool } from './read-dataset.js';
import { searchDatasetTool } from './search-dataset.js';
import { searchMembersTool } from './search-members.js';
import { getDatasetInfoTool } from './dataset-info.js';

export const datasetTools: Tool[] = [
    listDatasetsTool,
    readDatasetTool,
    searchDatasetTool,
    searchMembersTool,
    getDatasetInfoTool,
];
