import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { withFarmRequest } from './farmRequestGate';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('an ended HTTP lifetime cannot release a farm while a nested mutation still runs', async () => {
  const started = deferred();
  const release = deferred();
  const events: string[] = [];
  let mutation!: Promise<void>;
  const parent = withFarmRequest('gate-disconnect-fixture', async () => {
    mutation = withFarmRequest('gate-disconnect-fixture', async () => {
      events.push('mutation-start');
      started.resolve();
      await release.promise;
      events.push('mutation-finish');
    });
    await started.promise;
    // Equivalent to requireAuth finishing its wait on res.close.
    events.push('request-closed');
  });
  await started.promise;
  const next = withFarmRequest('gate-disconnect-fixture', async () => {
    events.push('next-request');
  });
  try {
    await withFarmRequest('gate-unrelated-fixture', async () => {
      events.push('unrelated-farm');
    });
    await nextTurn();
    assert(events.includes('request-closed'));
    assert(events.includes('unrelated-farm'));
    assert.equal(events.includes('next-request'), false);
  } finally {
    release.resolve();
    await Promise.all([parent, mutation, next]);
  }
  assert(events.indexOf('mutation-finish') < events.indexOf('next-request'));
});

test('failed parent request retains nested work and releases the queue afterwards', async () => {
  const started = deferred();
  const release = deferred();
  let mutation!: Promise<void>;
  let nextEntered = false;
  const parent = withFarmRequest('gate-failed-parent-fixture', async () => {
    mutation = withFarmRequest('gate-failed-parent-fixture', async () => {
      started.resolve();
      await release.promise;
    });
    await started.promise;
    throw new Error('fixture-request-closed');
  });
  const failure = assert.rejects(parent, /fixture-request-closed/);
  await started.promise;
  const next = withFarmRequest('gate-failed-parent-fixture', async () => { nextEntered = true; });
  try {
    await nextTurn();
    assert.equal(nextEntered, false);
  } finally {
    release.resolve();
    await Promise.all([failure, mutation, next]);
  }
  assert.equal(nextEntered, true);
});

test('awaited reentrant operations complete without deadlock and errors do not poison the queue', async () => {
  assert.equal(await withFarmRequest('gate-reentrant-fixture', async () =>
    withFarmRequest('gate-reentrant-fixture', async () => 42)), 42);
  await assert.rejects(withFarmRequest('gate-reentrant-fixture', async () =>
    withFarmRequest('gate-reentrant-fixture', async () => { throw new Error('fixture-error'); })), /fixture-error/);
  assert.equal(await withFarmRequest('gate-reentrant-fixture', async () => 'released'), 'released');
});
