import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOL_GROUPS, allTools } from '../dist/tools/registry.js';

test('every group is described in plain language', () => {
    for (const group of TOOL_GROUPS) {
        assert.ok(group.id, 'group needs an id');
        assert.ok(group.title, `${group.id} needs a title`);
        assert.ok(group.summary.endsWith('.'), `${group.id} summary should read as a sentence`);
        assert.ok(group.tools.length > 0, `${group.id} has no tools`);
    }
});

test('tool names are unique and follow one naming convention', () => {
    const names = allTools().map((tool) => tool.name);
    assert.equal(new Set(names).size, names.length, 'duplicate tool name');
    for (const name of names) {
        assert.match(name, /^[a-z][a-z0-9_]*$/, `${name} is not snake_case`);
    }
});

test('group ids are unique', () => {
    const ids = TOOL_GROUPS.map((group) => group.id);
    assert.equal(new Set(ids).size, ids.length);
});
