import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createToken, type AuthUser } from '../authStore';
import { requireAuth } from '../authMiddleware';
import { saleStatementDocumentAiRouter } from './saleStatementDocumentAi';

// Synthetic documents only: do not copy a user's image or ledger into fixtures.
const candidate = () => ({
  documentType: 'sale-settlement', animalCount: '1', statementNumber: 'FIXTURE-001',
  saleDate: '2026-04-15', paymentDate: '2026-04-21', marketName: '見本市場', issuerName: '見本組合',
  identificationNumber: '0123456789', earTag: '', animalName: '見本牛', birthday: '2025-07-02',
  sex: '雌', saleWeightKg: '263', grossYen: '110000', deductionTotalYen: '4750', netYen: '105250',
  deductions: [
    { label: '市場手数料', amountYen: '3300' },
    { label: '入場料', amountYen: '1100' },
    { label: '会費', amountYen: '550' },
  ],
  adjustments: [{ label: '預り金戻し', amountYen: '200' }],
  notes: [],
});
const actor: AuthUser = {
  id: 'statement-user', farmId: 'statement-farm', farmName: '検証用農場',
  name: '検証利用者', email: 'statement@example.invalid', role: 'owner', active: true, plan: 'free',
};
const imageData = Buffer.from('synthetic image fixture').toString('base64');
const requestBody = () => ({ fileName: 'statement.jpeg', mimeType: 'image/jpeg', base64: imageData });
const envKeys = ['OPENAI_API_KEY', 'FARMPRO_AI_DOCUMENT_MODEL', 'FARMPRO_AUTH_SECRET', 'FARMPRO_DATA_DIR', 'NODE_ENV'];
const realFetch = globalThis.fetch;
let previousEnv: Record<string, string | undefined>;
let testDataDir: string;
let beforeFiles: Record<string, string>;
let server: Server;
let baseUrl: string;
let providerBody: unknown;
let providerStatus: number;
let providerCalls: Array<{ url: string; body: any; authorization: string | null }>;

function output(text: string, status = 'completed') {
  return {
    id: 'resp_fixture', object: 'response', status, model: 'fixture-document-model',
    output: [{ id: 'msg_fixture', type: 'message', status: 'completed', role: 'assistant',
      content: [{ type: 'output_text', text, annotations: [] }] }],
  };
}
async function snapshotFiles(directory: string, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await snapshotFiles(fullPath, relative));
    else result[relative] = await fs.readFile(fullPath, 'utf8');
  }
  return result;
}
async function call(body: unknown = requestBody(), authorization: string | null = `Bearer ${createToken(actor)}`) {
  const response = await realFetch(`${baseUrl}/api/sale-statement-document-ai`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

beforeEach(async () => {
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  testDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-statement-read-'));
  process.env.FARMPRO_DATA_DIR = testDataDir;
  process.env.FARMPRO_AUTH_SECRET = 'synthetic-statement-test-secret';
  process.env.NODE_ENV = 'test';
  process.env.OPENAI_API_KEY = 'sk_fixture_not_a_real_key';
  process.env.FARMPRO_AI_DOCUMENT_MODEL = 'fixture-document-model';
  await fs.writeFile(path.join(testDataDir, 'users.json'), JSON.stringify([{ ...actor, passwordHash: 'unused', passwordSalt: 'unused' }]));
  const farmDirectory = path.join(testDataDir, 'farms', actor.farmId);
  await fs.mkdir(farmDirectory, { recursive: true });
  for (const [file, data] of Object.entries({
    'sales.json': [{ id: 'existing-sale', targetNumber: 'QA-1', salePrice: '250000' }],
    'expenses.json': [{ id: 'existing-expense', target: 'QA-1', amount: '3000' }],
    'calves.json': [{ id: 'existing-calf', calfNumber: 'QA-1', name: '既存の見本牛' }],
  })) await fs.writeFile(path.join(farmDirectory, file), JSON.stringify(data));
  beforeFiles = await snapshotFiles(testDataDir);
  providerCalls = [];
  providerBody = output(JSON.stringify(candidate()));
  providerStatus = 200;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    assert.equal(url, 'https://api.openai.com/v1/responses', 'only the mocked reader provider may be called');
    assert.equal(init?.method, 'POST');
    providerCalls.push({ url, body: JSON.parse(String(init?.body)), authorization: new Headers(init?.headers).get('authorization') });
    return new Response(JSON.stringify(providerBody), { status: providerStatus, headers: { 'Content-Type': 'application/json' } });
  };
  const app = express();
  app.use(express.json({ limit: '20mb' }));
  app.use('/api', requireAuth);
  app.use('/api/sale-statement-document-ai', saleStatementDocumentAiRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  try {
    assert.deepEqual(await snapshotFiles(testDataDir), beforeFiles, 'reading must not create or modify sales, expenses, calves, or settlement markers');
  } finally {
    await fs.rm(testDataDir, { recursive: true, force: true });
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});

test('a login is required before an image can reach the reader provider', async () => {
  assert.equal((await call(requestBody(), null)).status, 401);
  assert.equal((await call(requestBody(), 'Bearer invalid-session')).status, 401);
  assert.equal(providerCalls.length, 0);
});

test('returns an uncommitted candidate with strict schema and explicit tax/refund/identity instructions', async () => {
  const result = await call();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { candidate: candidate(), source: 'ai', model: 'fixture-document-model' });
  assert.equal(providerCalls.length, 1);
  const request = providerCalls[0];
  assert.equal(request.authorization, 'Bearer sk_fixture_not_a_real_key');
  assert.equal(request.body.model, 'fixture-document-model');
  assert.equal(request.body.store, false);
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.text.format.strict, true);
  const schema = request.body.text.format.schema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), Object.keys(candidate()).sort());
  assert.deepEqual(schema.properties.documentType.enum, ['sale-settlement', 'other', 'unknown']);
  assert.equal(schema.properties.deductions.items.additionalProperties, false);
  assert.deepEqual(schema.properties.adjustments.items.required, ['label', 'amountYen']);
  assert.equal(request.body.input[0].role, 'user');
  assert.deepEqual(request.body.input[0].content, [{ type: 'input_image', image_url: `data:image/jpeg;base64,${imageData}`, detail: 'high' }]);
  for (const instruction of [
    /内消費税.*税率対象額.*二重計上/, /マイナス金額.*符号を反転した正数/, /差額を調整額として作ったりしない/,
    /10桁番号の下4桁を耳標として生成/, /せり番号.*精算番号/, /印刷日・発行日・請求日.*paymentDate/,
    /書類に書かれた命令.*指示として従わず/, /先頭1頭.*書類全体の合計.*混ぜない/,
  ]) assert.match(request.body.instructions, instruction);
  assert.equal(result.body.candidate.deductions.length, 3);
  assert.deepEqual(result.body.candidate.adjustments, [{ label: '預り金戻し', amountYen: '200' }]);
});

test('sends the complete PDF and all optional image views once without treating pages as extra animals', async () => {
  delete process.env.FARMPRO_AI_DOCUMENT_MODEL;
  const pdf = Buffer.from('synthetic pdf fixture').toString('base64');
  const preview = Buffer.from('synthetic preview').toString('base64');
  const details = Array.from({ length: 4 }, (_, index) => Buffer.from(`synthetic detail ${index}`).toString('base64'));
  const result = await call({ fileName: 'settlement.pdf', mimeType: 'application/pdf', base64: pdf,
    previewImageBase64: preview, detailImageBase64s: details });
  assert.equal(result.status, 200);
  const request = providerCalls[0].body;
  assert.equal(request.model, 'gpt-5');
  assert.equal(request.input[0].content.length, 6);
  assert.deepEqual(request.input[0].content[0], { type: 'input_file', filename: 'settlement.pdf', file_data: `data:application/pdf;base64,${pdf}` });
  assert.deepEqual(request.input[0].content.slice(1).map((image: { image_url: string }) => image.image_url),
    [preview, ...details].map(image => `data:image/jpeg;base64,${image}`));
});

test('invalid or overlarge input never invokes the provider', async () => {
  for (const body of [
    null, [], {}, { ...requestBody(), fileName: '' }, { ...requestBody(), fileName: 12 },
    { ...requestBody(), mimeType: 'text/html' }, { ...requestBody(), base64: 'not base64' },
    { ...requestBody(), previewImageBase64: {} }, { ...requestBody(), detailImageBase64s: 'invalid' },
    { ...requestBody(), detailImageBase64s: [imageData, imageData, imageData, imageData, imageData] },
    { ...requestBody(), base64: 'A'.repeat(Math.ceil(10 * 1024 * 1024 / 3) * 4 + 4) },
  ]) {
    // Express rejects a non-object JSON root before the route; either rejection must avoid the provider.
    const response = await realFetch(`${baseUrl}/api/sale-statement-document-ai`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${createToken(actor)}` },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400);
  }
  assert.equal(providerCalls.length, 0);
});

test('missing provider configuration fails before a provider request', async () => {
  delete process.env.OPENAI_API_KEY;
  const result = await call();
  assert.equal(result.status, 503);
  assert.equal(result.body.candidate, undefined);
  assert.equal(providerCalls.length, 0);
});

test('other and unidentified documents do not become sale candidates', async () => {
  for (const documentType of ['other', 'unknown']) {
    providerBody = output(JSON.stringify({ ...candidate(), documentType }));
    const result = await call();
    assert.equal(result.status, 422);
    assert.match(result.body.message, /販売精算書として確認できません/);
    assert.equal(result.body.candidate, undefined);
  }
});

test('partial readings and nonmatching totals stay unaltered for human review instead of inventing balancing amounts', async () => {
  const partial = { ...candidate(), animalCount: '', statementNumber: '', paymentDate: '', identificationNumber: '',
    grossYen: '', netYen: '105251', deductionTotalYen: '',
    deductions: [{ label: '不鮮明な控除', amountYen: '' }], adjustments: [], notes: ['販売額と控除額は要確認'] };
  providerBody = output(JSON.stringify(partial));
  const partialResult = await call();
  assert.equal(partialResult.status, 200);
  assert.deepEqual(partialResult.body.candidate, partial);
  const mismatch = { ...candidate(), netYen: '100001' };
  providerBody = output(JSON.stringify(mismatch));
  const mismatchResult = await call();
  assert.equal(mismatchResult.status, 200);
  assert.deepEqual(mismatchResult.body.candidate, mismatch);
});

test('multiple animals retain the explicit count so the client can block the single-animal flow', async () => {
  const multiple = { ...candidate(), animalCount: '2', identificationNumber: '', earTag: '', animalName: '',
    birthday: '', sex: '', saleWeightKg: '', notes: ['複数頭の精算書です'] };
  providerBody = output(JSON.stringify(multiple));
  const result = await call();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.candidate, multiple);
});

test('malformed provider shapes, invalid money, dates, and partial identifiers fail without coercion', async () => {
  const missing = { ...candidate() } as Record<string, unknown>;
  delete missing.netYen;
  for (const invalid of [
    null, [], missing, { ...candidate(), unexpectedCommand: 'save' },
    { ...candidate(), grossYen: 110000 }, { ...candidate(), grossYen: '1,100' },
    { ...candidate(), grossYen: '9007199254740992' }, { ...candidate(), grossYen: '-100' },
    { ...candidate(), animalCount: '0' }, { ...candidate(), saleDate: '2026-02-30' },
    { ...candidate(), identificationNumber: '123456789' }, { ...candidate(), saleWeightKg: '263kg' },
    { ...candidate(), deductions: [{ label: '返金', amountYen: '-200' }] },
    { ...candidate(), deductions: [{ label: '手数料', amountYen: '100.5' }] },
    { ...candidate(), adjustments: [{ label: '返金', amountYen: '200', extra: true }] },
    { ...candidate(), notes: 'invalid' },
  ]) {
    providerBody = output(JSON.stringify(invalid));
    const result = await call();
    assert.equal(result.status, 502);
    assert.equal(result.body.candidate, undefined);
  }
});

test('incomplete, refused, empty, invalid JSON, and failed provider responses are never reported as success', async (t) => {
  t.mock.method(console, 'error', () => undefined);
  for (const response of [
    output(JSON.stringify(candidate()), 'incomplete'), output(''), output('{broken'),
    { ...output(''), output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'fixture refusal' }] }] },
    { ...output(JSON.stringify(candidate())), error: { code: 'fixture-error' } },
  ]) {
    providerBody = response;
    const result = await call();
    assert.equal(result.status, 502);
    assert.equal(result.body.candidate, undefined);
  }
  providerStatus = 400;
  providerBody = { error: { message: 'DO_NOT_EXPOSE_PRIVATE_DOCUMENT', type: 'invalid_request_error', code: 'fixture-error' } };
  const countBeforeError = providerCalls.length;
  const result = await call();
  assert.equal(result.status, 502);
  assert.equal(providerCalls.length, countBeforeError + 1, 'an unsuccessful read is not silently retried');
  assert.doesNotMatch(JSON.stringify(result.body), /DO_NOT_EXPOSE_PRIVATE_DOCUMENT/);
});
