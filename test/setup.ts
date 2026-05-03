import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import nock from 'nock';
import { setGlobalDispatcher, getGlobalDispatcher, MockAgent } from 'undici';

// Belt-and-suspenders network isolation:
// - nock blocks node:http/https (kept for legacy fakers; we don't use it directly).
// - undici MockAgent intercepts undici.request (our HTTP client). Tests that need
//   network responses opt in by setting up interceptors; everything unmocked throws.
//
// MockAgent is recreated per test so that interceptors can't leak across tests
// (notably `.times(N)` and `.persist()` previously leaked into adjacent tests).

let priorDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

beforeAll(() => {
  nock.disableNetConnect();
  priorDispatcher = getGlobalDispatcher();
});

beforeEach(() => {
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(async () => {
  nock.cleanAll();
  await mockAgent.close();
});

afterAll(() => {
  setGlobalDispatcher(priorDispatcher);
  nock.enableNetConnect();
});

export function getMockAgent(): MockAgent {
  return mockAgent;
}
