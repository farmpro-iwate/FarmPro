import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isLatestBreedingSireQuestion,
  isLatestPregnancyCheckQuestion,
} from './farmAi';

test('identified cattle pregnancy check question works without 前回/直近/最後', () => {
  assert.equal(isLatestPregnancyCheckQuestion('7358番 はなみつの妊娠鑑定は？'), true);
  assert.equal(isLatestPregnancyCheckQuestion('7358番の妊鑑は？'), true);
});

test('pregnancy check question without cattle context still needs latest wording', () => {
  assert.equal(isLatestPregnancyCheckQuestion('妊娠鑑定は？'), false);
  assert.equal(isLatestPregnancyCheckQuestion('前回の妊娠鑑定は？'), true);
});

test('latest used sire question is treated as breeding history', () => {
  assert.equal(isLatestBreedingSireQuestion('7358番 はなみつの前回使用した種雄牛は？'), true);
  assert.equal(isLatestBreedingSireQuestion('7358番が最後に使った父牛は？'), true);
});

test('plain sire question remains basic cattle information', () => {
  assert.equal(isLatestBreedingSireQuestion('7358番の父牛は？'), false);
  assert.equal(isLatestBreedingSireQuestion('7358番の種雄牛は？'), false);
});
