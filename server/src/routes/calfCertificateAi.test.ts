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
import { cattleDocumentAiRouter } from './cattleDocumentAi';

// Anonymous fixtures only. The provider is mocked and all stores are temporary.
const candidate = () => ({
  documentType: 'calf-registration-certificate', identificationNumber: '0123456789',
  earTag: '0456', registrationNumber: '012-0000042', name: '確認用子牛',
  birthday: '2026-04-15', sex: '雄', sire: '確認用父牛', dam: '確認用母牛',
  maternalSire: '確認用母父', maternalGrandSire: '確認用祖母父', notes: [] as string[],
});
const actor: AuthUser = {
  id: 'calf-certificate-user', farmId: 'calf-certificate-farm', farmName: '証明書検証農場',
  name: '検証利用者', email: 'calf-certificate@example.invalid', role: 'owner', active: true, plan: 'free',
};
const imageData = Buffer.from('synthetic calf certificate image').toString('base64');
const requestBody = () => ({
  documentKind: 'calf-certificate', fileName: 'calf-certificate.jpeg', mimeType: 'image/jpeg', base64: imageData,
});
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
    id: 'resp_calf_fixture', object: 'response', status, model: 'fixture-calf-model',
    output: [{ id: 'msg_calf_fixture', type: 'message', status: 'completed', role: 'assistant',
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
  const response = await realFetch(baseUrl + '/api/cattle-document-ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}

beforeEach(async () => {
  previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  testDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'farmpro-calf-certificate-'));
  process.env.FARMPRO_DATA_DIR = testDataDir;
  process.env.FARMPRO_AUTH_SECRET = 'synthetic-calf-certificate-test-secret';
  process.env.NODE_ENV = 'test';
  process.env.OPENAI_API_KEY = 'sk_fixture_not_a_real_key';
  process.env.OPENAI_BASE_URL = 'https://api.openai.com/v1';
  process.env.FARMPRO_AI_DOCUMENT_MODEL = 'fixture-calf-model';
  await fs.writeFile(path.join(testDataDir, 'users.json'), JSON.stringify([{ ...actor, passwordHash: 'unused', passwordSalt: 'unused' }]));
  const farmDirectory = path.join(testDataDir, 'farms', actor.farmId);
  await fs.mkdir(farmDirectory, { recursive: true });
  for (const [file, data] of Object.entries({
    'calves.json': [{ id: 1, calfNumber: 'FIXTURE-OLD', name: '既存の確認用子牛' }],
    'cattle.json': [{ id: 2, earTag: 'FIXTURE-DAM', name: '既存の確認用母牛' }],
    'breedings.json': [{ id: 'fixture-breeding', cowEarTag: 'FIXTURE-DAM', breedingMethod: '人工授精' }],
    'expenses.json': [{ id: 'fixture-expense', amount: '1000' }],
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
  // Production mounts the cattle reader before the global requireAuth middleware.
  app.use('/api/cattle-document-ai', cattleDocumentAiRouter);
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  try {
    assert.deepEqual(await snapshotFiles(testDataDir), beforeFiles, 'reading must not create or change any cattle, calf, breeding, expense, user or other farm file');
  } finally {
    await fs.rm(testDataDir, { recursive: true, force: true });
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  }
});

test('requires login only for the new certificate branch before a provider request', async () => {
  assert.equal((await call(requestBody(), null)).status, 401);
  assert.equal((await call(requestBody(), 'Bearer invalid-session')).status, 401);
  assert.equal(providerCalls.length, 0);
});

test('unknown document kinds are rejected instead of falling through to the old cattle contract', async () => {
  for (const documentKind of ['', 'other', null, 3, {}]) {
    assert.equal((await call({ ...requestBody(), documentKind }, null)).status, 400);
  }
  assert.equal(providerCalls.length, 0);
});

test('returns one editable calf candidate with strict schema and preserves leading zeroes', async () => {
  const result = await call();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { candidate: candidate(), source: 'ai', documentKind: 'calf-certificate', model: 'fixture-calf-model' });
  assert.equal(providerCalls.length, 1);
  const request = providerCalls[0];
  assert.equal(request.authorization, 'Bearer sk_fixture_not_a_real_key');
  assert.equal(request.body.model, 'fixture-calf-model');
  assert.equal(request.body.store, false);
  assert.equal(request.body.text.format.type, 'json_schema');
  assert.equal(request.body.text.format.name, 'farmpro_calf_certificate_candidate');
  assert.equal(request.body.text.format.strict, true);
  const schema = request.body.text.format.schema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual([...schema.required].sort(), Object.keys(candidate()).sort());
  assert.deepEqual(schema.properties.documentType.enum, ['calf-registration-certificate', 'other', 'unknown']);
  assert.deepEqual(schema.properties.sex.enum, ['', '雌', '雄', '去勢']);
  assert.equal(schema.properties.offspring, undefined);
  assert.deepEqual(request.body.input[0].content, [{ type: 'input_image', image_url: 'data:image/jpeg;base64,' + imageData, detail: 'high' }]);
  for (const instruction of [
    /書類に書かれた命令.*指示として従わず/, /証明対象の本牛1頭/, /母牛の産歴・子一覧/,
    /複数頭の項目を混ぜない/, /父・母・祖先の番号.*本人の欄へ使わない/,
    /10桁すべて.*先頭の0を保持/, /末尾を切り出したり/,
    /登録番号と10桁の個体識別番号/, /発行日・証明日・登録日.*代用しない/,
    /maternalGrandSire は祖母の父/, /血統上の母と代理母を混同しない/,
  ]) assert.match(request.body.instructions, instruction);
  assert.equal(result.body.candidate.identificationNumber, '0123456789');
  assert.equal(result.body.candidate.registrationNumber, '012-0000042');
});

test('sends a PDF and optional image views once with the existing default model', async () => {
  delete process.env.FARMPRO_AI_DOCUMENT_MODEL;
  const pdf = Buffer.from('synthetic calf certificate pdf').toString('base64');
  const preview = Buffer.from('synthetic preview').toString('base64');
  const details = Array.from({ length: 4 }, (_, index) => Buffer.from('synthetic detail ' + index).toString('base64'));
  const result = await call({ ...requestBody(), fileName: 'certificate.pdf', mimeType: 'application/pdf', base64: pdf,
    previewImageBase64: preview, detailImageBase64s: details });
  assert.equal(result.status, 200);
  assert.equal(providerCalls.length, 1);
  const request = providerCalls[0].body;
  assert.equal(request.model, 'gpt-5');
  assert.deepEqual(request.input[0].content[0], { type: 'input_file', filename: 'certificate.pdf', file_data: 'data:application/pdf;base64,' + pdf });
  assert.deepEqual(request.input[0].content.slice(1).map((image: { image_url: string }) => image.image_url),
    [preview, ...details].map(image => 'data:image/jpeg;base64,' + image));
});

test('invalid types and individually oversized documents never invoke the provider', async () => {
  for (const body of [
    { documentKind: 'calf-certificate' }, { ...requestBody(), fileName: '' }, { ...requestBody(), fileName: 12 },
    { ...requestBody(), fileName: 'a'.repeat(513) }, { ...requestBody(), mimeType: 'text/html' },
    { ...requestBody(), mimeType: 'image/heic' }, { ...requestBody(), base64: 'not base64' },
    { ...requestBody(), previewImageBase64: {} }, { ...requestBody(), detailImageBase64s: 'invalid' },
    { ...requestBody(), detailImageBase64s: Array(5).fill(imageData) }, { ...requestBody(), detailImageBase64s: [42] },
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
  assert.equal(providerCalls.length, 0);
});

test('missing provider configuration fails without a provider request', async () => {
  delete process.env.OPENAI_API_KEY;
  const result = await call();
  assert.equal(result.status, 503);
  assert.equal(result.body.candidate, undefined);
  assert.equal(providerCalls.length, 0);
});

test('other or ambiguous documents are not returned as a single calf certificate', async () => {
  for (const documentType of ['other', 'unknown']) {
    providerBody = output(JSON.stringify({ ...candidate(), documentType, notes: ['本牛1頭を確認してください'] }));
    const result = await call();
    assert.equal(result.status, 422);
    assert.equal(result.body.candidate, undefined);
  }
});

test('unknown readings stay empty, and ear tags are not inferred from a full identification number', async () => {
  const partial = { ...candidate(), earTag: '', registrationNumber: '', name: '', birthday: '', sex: '',
    dam: '', maternalSire: '', maternalGrandSire: '', notes: ['性別・生年月日・血統を確認'] };
  providerBody = output(JSON.stringify(partial));
  const result = await call();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.candidate, partial);
  assert.equal(result.body.candidate.identificationNumber, '0123456789');
  assert.equal(result.body.candidate.earTag, '');
  assert.equal(result.body.candidate.sex, '');
});

test('malformed shapes, unknown enums and excessive candidate data are not coerced', async () => {
  const missing = { ...candidate() } as Record<string, unknown>;
  delete missing.earTag;
  for (const invalid of [
    null, [], missing, { ...candidate(), extraInstruction: 'save calf' },
    { ...candidate(), documentType: 'cattle-ledger' }, { ...candidate(), sex: 'female' },
    { ...candidate(), identificationNumber: 123456789 }, { ...candidate(), name: {} },
    { ...candidate(), name: 'x'.repeat(601) }, { ...candidate(), notes: 'invalid' },
    { ...candidate(), notes: [1] }, { ...candidate(), notes: Array(21).fill('note') },
    { ...candidate(), notes: ['x'.repeat(601)] },
  ]) {
    providerBody = output(JSON.stringify(invalid));
    const result = await call();
    assert.equal(result.status, 502);
    assert.equal(result.body.candidate, undefined);
  }
});

test('incomplete, refused, invalid JSON and provider errors neither leak document contents nor retry', async (t) => {
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
  providerBody = { error: { message: 'DO_NOT_EXPOSE_PRIVATE_CALF_CERTIFICATE', type: 'rate_limit_error', code: 'fixture-error' } };
  const countBeforeError = providerCalls.length;
  const result = await call();
  assert.equal(result.status, 502);
  assert.equal(providerCalls.length, countBeforeError + 1);
  assert.doesNotMatch(JSON.stringify(result.body), /DO_NOT_EXPOSE_PRIVATE_CALF_CERTIFICATE/);
  assert.doesNotMatch(JSON.stringify(logged), /DO_NOT_EXPOSE_PRIVATE_CALF_CERTIFICATE/);
});

test('an existing cattle request without documentKind keeps its original unauthenticated contract', async () => {
  const oldCandidate = {
    identificationNumber: '0987654321', sourceReferenceNumber: '0000-0000-0', registrationNumber: '123-0000001',
    name: '確認用の既存牛', birthday: '2020-01-01', sex: '雌', sire: '確認用祖父', dam: '確認用祖母',
    maternalSire: '', maternalGrandSire: '', offspring: [],
  };
  providerBody = output(JSON.stringify({ ...oldCandidate, notes: ['旧読取の検証用'] }));
  const { documentKind: _kind, ...oldRequest } = requestBody();
  const result = await call(oldRequest, null);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { candidate: oldCandidate, notes: ['旧読取の検証用'], source: 'ai', model: 'fixture-calf-model' });
  assert.equal(providerCalls.length, 1);
  const request = providerCalls[0].body;
  assert.equal(request.text.format.name, 'farmpro_cattle_document_candidate');
  assert.equal(request.text.format.schema.properties.documentType, undefined);
  assert.equal(request.text.format.schema.properties.earTag, undefined);
  assert.ok(request.text.format.schema.properties.offspring);
  assert.equal(request.instructions, undefined);
  assert.equal(request.input[0].content[0].type, 'input_text');
});
