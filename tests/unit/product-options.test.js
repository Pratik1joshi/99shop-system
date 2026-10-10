import test from 'node:test';
import assert from 'node:assert/strict';
import { axesFrom, planOptions } from '../../lib/product-options.js';

const v = (id, attributes, variant_name = Object.values(attributes).join(' / ')) => ({ id, variant_name, attributes });
const names = (plan, variants) => ({
  add: plan.add.map((t) => Object.values(t).join(' / ')),
  remove: plan.remove.map((i) => variants[i].variant_name),
});

test('adding sizes/colours to a plain product replaces Standard', () => {
  const variants = [{ id: 1, variant_name: 'Standard', attributes: {} }];
  const plan = planOptions([{ name: 'Colour', values: 'Red, Blue' }], variants);
  assert.deepEqual(names(plan, variants), { add: ['Red', 'Blue'], remove: ['Standard'] });
});

test('editing values adds new combinations and removes dropped ones, keeping the rest', () => {
  const variants = [v(1, { Colour: 'Red', Size: 'S' }), v(2, { Colour: 'Red', Size: 'M' }), v(3, { Colour: 'Blue', Size: 'S' }), v(4, { Colour: 'Blue', Size: 'M' }), { id: 5, variant_name: 'Standard', attributes: {} }];
  assert.deepEqual(axesFrom(variants), [{ name: 'Colour', values: 'Red, Blue' }, { name: 'Size', values: 'S, M' }]);
  const plan = planOptions([{ name: 'Colour', values: 'Red, Pink' }, { name: 'Size', values: 'S, M, L' }], variants);
  assert.deepEqual(names(plan, variants), { add: ['Red / L', 'Pink / S', 'Pink / M', 'Pink / L'], remove: ['Blue / S', 'Blue / M', 'Standard'] });
  assert.equal(plan.renamed, 0);
  assert.deepEqual([...plan.keep.keys()].sort(), [0, 1]);
});

test('adding or dropping a whole type keeps the versions and renames them', () => {
  const variants = [v(1, { Colour: 'Red' }), v(2, { Colour: 'Blue' })];
  const added = planOptions([{ name: 'Colour', values: 'Red, Blue' }, { name: 'Size', values: 'S, M' }], variants);
  assert.deepEqual(names(added, variants), { add: ['Red / M', 'Blue / M'], remove: [] });
  assert.equal(added.renamed, 2);

  const sized = [v(1, { Colour: 'Red', Size: 'S' }), v(2, { Colour: 'Red', Size: 'M' })];
  const dropped = planOptions([{ name: 'Colour', values: 'Red' }], sized);
  assert.deepEqual(names(dropped, sized), { add: [], remove: ['Red / M'] });
  assert.equal(dropped.renamed, 1);
});

test('no typed values never removes anything', () => {
  const variants = [v(1, { Colour: 'Red' })];
  assert.deepEqual(planOptions([{ name: 'Colour', values: '' }], variants).remove, []);
});
