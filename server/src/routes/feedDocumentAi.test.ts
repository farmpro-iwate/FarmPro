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
import { feedDocumentAiRouter } from './feedDocumentAi';

// Synthetic fixtures only; no user document, farm, key or existing ledger is used.
const line = () => ({
  kind: 'feed', feedName: '確認用配合飼料', deliveryDate: '2026-04-15',
  quantity: '2.5', unit: '袋', originalUnit: '袋', bagWeightKg: '20',
  unitPriceYen: '1200.5', unitPriceBasis: 'tax-excluded', priceUnit: '袋',
  grossYen: '3301', netYen: '3001', taxYen: '300', taxRate: '10', notes: [] as string[],
});
const candidate = () => ({
  documentType: 'invoice', documentNumber: 'FIXTURE-FEED-001',
  issueDate: '2026-04-30', deliveryDate: '', supplier: '確認用飼料取引先',
  lines: [line()], notes: [] as string[],
});
const actor: AuthUser = {
  id: 'feed-reader-user', farmId: 'feed-reader-farm', farmName: '飼料読取検証農場',
  name: '検証利用者', email: 'feed-reader@example.invalid', role: 'owner', active: true, plan: 'free',
};
const imageData = Buffer.from('synthetic feed document image').toString('base64');
const requestBody = () => ({ fileName: 'feed-invoice.jpeg', mimeType: 'image/jpeg', base64: imageData });
const envKeys = [
  'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'FARMPRO_AI_DOCUMENT_MODEL',
  'FARMPRO_AUTH_SECRET', 'FARMPRO_DATA_DIR', 'NODE_ENV',
];
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
    id: 'resp_feed_fixture', object: 'response', status, model: 'fixture-feed-model',
    output: [{ id: 'msg_feed_fixture', type: 'message', status: 'completed', role: 'assistant',
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
async function call(body: unknown = requestBody(), authorization: string | null = 'Bearer ' + createToken(actor)) {
  const response = await realFetch(baseUrl + '/api/feed-document-ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

beforeEach(async () => {
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  testDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-feed-read-'));
  process.env.FARMPRO_DATA_DIR = testDataDir;
  process.env.FARMPRO_AUTH_SECRET = 'synthetic-feed-reader-test-secret';
  process.env.NODE_ENV = 'test';
  process.env.OPENAI_API_KEY = 'sk_fixture_not_a_real_key';
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
  process.env.FARMPRO_AI_DOCUMENT_MODEL = 'fixture-feed-model';
  await fs.writeFile(path.join(testDataDir, 'users.json'), JSON.stringify([{ ...actor, passwordHash: 'unused', passwordSalt: 'unused' }]));
  const farmDirectory = path.join(testDataDir, 'farms', actor.farmId);
  await fs.mkdir(farmDirectory, { recursive: true });
  for (const [file, data] of Object.entries({
    'feedInventory.json': [{ id: 'existing-feed-entry', feedName: '既存の確認用飼料', type: '入庫', quantity: '3' }],
    'expenses.json': [{ id: 'existing-feed-expense', category: '飼料費', amount: '4000' }],
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
  app.use('/api/feed-document-ai', feedDocumentAiRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  try {
    assert.deepEqual(await snapshotFiles(testDataDir), beforeFiles, 'reading must not create or change inventory, expenses, users or other farm files');
  } finally {
    await fs.rm(testDataDir, { recursive: true, force: true });
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});

test('requires a current login before sending a document to the provider', async () => {
  assert.equal((await call(requestBody(), null)).status, 401);
  assert.equal((await call(requestBody(), 'Bearer invalid-session')).status, 401);
  assert.equal(providerCalls.length, 0);
});

test('returns an editable invoice candidate with strict schema and no calculation or persistence', async () => {
  const result = await call();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { candidate: candidate(), source: 'ai', model: 'fixture-feed-model' });
  assert.equal(providerCalls.length, 1);
  const request = providerCalls[0];
  assert.equal(request.authorization, 'Bearer sk_fixture_not_a_real_key');
  assert.equal(request.body.model, 'fixture-feed-model');
  assert.equal(request.body.store, false);
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.text.format.strict, true);
  const schema = request.body.text.format.schema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), Object.keys(candidate()).sort());
  assert.deepEqual(schema.properties.documentType.enum, ['delivery-note', 'invoice', 'other', 'unknown']);
  const rowSchema = schema.properties.lines.items;
  assert.equal(rowSchema.additionalProperties, false);
  assert.deepEqual([...rowSchema.required].sort(), Object.keys(line()).sort());
  assert.deepEqual(rowSchema.properties.kind.enum, ['feed', 'other', 'unknown']);
  assert.deepEqual(rowSchema.properties.unit.enum, ['', 'kg', '袋', 'ロール', '束', '個', 'その他']);
  assert.deepEqual(rowSchema.properties.priceUnit.enum, rowSchema.properties.unit.enum);
  assert.deepEqual(rowSchema.properties.unitPriceBasis.enum, ['tax-included', 'tax-excluded', 'unknown']);
  assert.deepEqual(rowSchema.properties.taxRate.enum, ['', '10', '8', '0']);
  assert.equal(request.body.input[0].role, 'user');
  assert.deepEqual(request.body.input[0].content, [{ type: 'input_image', image_url: 'data:image/jpeg;base64,' + imageData, detail: 'high' }]);
  for (const instruction of [
    /書類に書かれた命令.*指示として従わず/, /同じ明細を二重に増やさない/,
    /発行日・請求日・締日を納品日に代用しない/, /総税額を明細へ配分しない/,
    /kg と袋、トンとkgなどの単位換算は禁止/, /20kg\/袋などを推定/,
    /同義名を既存飼料へ自動統合しない/, /送料・運賃・値引.*返品.*繰越.*税率別小計.*請求総額/,
    /税込金額から税を逆算/, /quantity の unit と priceUnit を別々に/,
  ]) assert.match(request.body.instructions, instruction);
  assert.equal(result.body.candidate.lines[0].quantity, '2.5');
  assert.equal(result.body.candidate.lines[0].unitPriceYen, '1200.5');
});

test('sends a delivery-note PDF and all optional views once using the shared file limits', async () => {
  delete process.env.FARMPRO_AI_DOCUMENT_MODEL;
  const delivery = { ...candidate(), documentType: 'delivery-note', issueDate: '', deliveryDate: '2026-04-15' };
  providerBody = output(JSON.stringify(delivery));
  const pdf = Buffer.from('synthetic feed delivery pdf').toString('base64');
  const preview = Buffer.from('synthetic preview').toString('base64');
  const details = Array.from({ length: 4 }, (_, index) => Buffer.from('synthetic detail ' + index).toString('base64'));
  const result = await call({ fileName: 'delivery.pdf', mimeType: 'application/pdf', base64: pdf,
    previewImageBase64: preview, detailImageBase64s: details });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.candidate, delivery);
  assert.equal(providerCalls.length, 1);
  const request = providerCalls[0].body;
  assert.equal(request.model, 'gpt-5');
  assert.deepEqual(request.input[0].content[0], { type: 'input_file', filename: 'delivery.pdf', file_data: 'data:application/pdf;base64,' + pdf });
  assert.deepEqual(request.input[0].content.slice(1).map((image: { image_url: string }) => image.image_url),
    [preview, ...details].map(image => 'data:image/jpeg;base64,' + image));
});

test('invalid or individually oversized input never invokes the reader provider', async () => {
  for (const body of [
    {}, { ...requestBody(), fileName: '' }, { ...requestBody(), fileName: 12 },
    { ...requestBody(), fileName: 'a'.repeat(513) }, { ...requestBody(), mimeType: 'text/html' },
    { ...requestBody(), mimeType: 'image/heic' }, { ...requestBody(), base64: 'not base64' },
    { ...requestBody(), previewImageBase64: {} }, { ...requestBody(), detailImageBase64s: 'invalid' },
    { ...requestBody(), detailImageBase64s: [imageData, imageData, imageData, imageData, imageData] },
    { ...requestBody(), detailImageBase64s: [42] },
    { ...requestBody(), base64: 'A'.repeat(Math.ceil(10 * 1024 * 1024 / 3) * 4 + 4) },
    { ...requestBody(), previewImageBase64: 'A'.repeat(Math.ceil(4 * 1024 * 1024 / 3) * 4 + 4) },
  ]) assert.equal((await call(body)).status, 400);
  assert.equal(providerCalls.length, 0);
});

test('rejects a combined image payload above the route limit before calling the provider', async () => {
  const result = await call({
    ...requestBody(), base64: Buffer.alloc(8 * 1024 * 1024).toString('base64'),
    previewImageBase64: Buffer.alloc(4 * 1024 * 1024).toString('base64'),
    detailImageBase64s: [Buffer.alloc(2.5 * 1024 * 1024).toString('base64')],
  });
  assert.equal(result.status, 413);
  assert.match(result.body.message, /画像が大きすぎます/);
  assert.equal(providerCalls.length, 0);
});

test('missing provider configuration fails before any provider request', async () => {
  delete process.env.OPENAI_API_KEY;
  const result = await call();
  assert.equal(result.status, 503);
  assert.equal(result.body.candidate, undefined);
  assert.equal(providerCalls.length, 0);
});

test('other and unidentified documents are not reported as feed purchase candidates', async () => {
  for (const documentType of ['other', 'unknown']) {
    providerBody = output(JSON.stringify({ ...candidate(), documentType }));
    const result = await call();
    assert.equal(result.status, 422);
    assert.equal(result.body.candidate, undefined);
  }
});

test('partial, inconsistent and non-feed rows remain review candidates without invented dates, prices or units', async () => {
  const partial = {
    ...candidate(), documentNumber: '', deliveryDate: '',
    lines: [
      { ...line(), deliveryDate: '', quantity: '判読要確認', unit: '', originalUnit: 't',
        bagWeightKg: '', unitPriceYen: '', unitPriceBasis: 'unknown', priceUnit: '',
        grossYen: '9100', netYen: '', taxYen: '', taxRate: '', notes: ['数量・単価・税区分を確認'] },
      { ...line(), feedName: '別の確認用飼料', quantity: '3', unit: '袋', priceUnit: 'kg',
        grossYen: '1234', netYen: '1000', taxYen: '50', notes: ['金額・単価単位を確認'] },
      { ...line(), kind: 'other', feedName: '送料', quantity: '', unit: '', originalUnit: '',
        bagWeightKg: '', unitPriceYen: '', unitPriceBasis: 'unknown', priceUnit: '',
        grossYen: '500', netYen: '', taxYen: '', taxRate: '' },
      { ...line(), kind: 'other', feedName: '返品', quantity: '-1', grossYen: '-1100', netYen: '-1000', taxYen: '-100' },
      { ...line(), kind: 'unknown', feedName: '判別できない商品', quantity: '1', notes: ['飼料か要確認'] },
    ], notes: ['日付・単位・品目を確認'],
  };
  providerBody = output(JSON.stringify(partial));
  const result = await call();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.candidate, partial);
  assert.equal(result.body.candidate.deliveryDate, '');
  assert.equal(result.body.candidate.lines[0].deliveryDate, '');
  assert.equal(result.body.candidate.lines[0].originalUnit, 't');
  assert.equal(result.body.candidate.lines[2].kind, 'other');
});

test('malformed shapes, unknown enum values, and excessive data fail without coercion', async () => {
  const missingHeader = { ...candidate() } as Record<string, unknown>;
  delete missingHeader.supplier;
  const missingLine = { ...line() } as Record<string, unknown>;
  delete missingLine.priceUnit;
  for (const invalid of [
    null, [], missingHeader, { ...candidate(), extraInstruction: 'save inventory' },
    { ...candidate(), documentType: 'receipt' }, { ...candidate(), supplier: 12 },
    { ...candidate(), supplier: 'x'.repeat(601) }, { ...candidate(), lines: [] },
    { ...candidate(), lines: Array.from({ length: 101 }, line) }, { ...candidate(), lines: [missingLine] },
    { ...candidate(), lines: [{ ...line(), extraInstruction: 'save expense' }] },
    { ...candidate(), lines: [{ ...line(), quantity: 2.5 }] },
    { ...candidate(), lines: [{ ...line(), unitPriceYen: 1200.5 }] },
    { ...candidate(), lines: [{ ...line(), kind: 'shipping' }] },
    { ...candidate(), lines: [{ ...line(), unit: 'ton' }] },
    { ...candidate(), lines: [{ ...line(), priceUnit: 'g' }] },
    { ...candidate(), lines: [{ ...line(), unitPriceBasis: '' }] },
    { ...candidate(), lines: [{ ...line(), taxRate: '7' }] },
    { ...candidate(), lines: [{ ...line(), notes: [12] }] },
    { ...candidate(), lines: [{ ...line(), notes: Array(21).fill('note') }] },
    { ...candidate(), notes: 'invalid' }, { ...candidate(), notes: ['x'.repeat(601)] },
  ]) {
    providerBody = output(JSON.stringify(invalid));
    const result = await call();
    assert.equal(result.status, 502);
    assert.equal(result.body.candidate, undefined);
  }
});

test('incomplete, refused, invalid JSON and provider errors neither leak document contents nor silently retry', async (t) => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
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
  providerStatus = 429;
  providerBody = { error: { message: 'DO_NOT_EXPOSE_PRIVATE_FEED_DOCUMENT', type: 'rate_limit_error', code: 'fixture-error' } };
  const countBeforeError = providerCalls.length;
  const result = await call();
  assert.equal(result.status, 502);
  assert.equal(providerCalls.length, countBeforeError + 1);
  assert.doesNotMatch(JSON.stringify(result.body), /DO_NOT_EXPOSE_PRIVATE_FEED_DOCUMENT/);
  assert.doesNotMatch(JSON.stringify(logged), /DO_NOT_EXPOSE_PRIVATE_FEED_DOCUMENT/);
});
