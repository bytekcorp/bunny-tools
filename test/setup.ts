import { afterAll, afterEach, beforeAll } from 'vitest';
import nock from 'nock';
import { setGlobalDispatcher, getGlobalDispatcher, MockAgent } from 'undici';

// Belt-and-suspenders network isolation:
// - nock blocks node:http/https (kept for legacy fakers; we don't use it directly).
// - undici MockAgent intercepts undici.request (our HTTP client). Tests that need
//   network responses opt in by setting up interceptors; everything unmocked throws.

let priorDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

beforeAll(() => {
  nock.disableNetConnect();
  priorDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(async () => {
  await mockAgent.close();
  setGlobalDispatcher(priorDispatcher);
  nock.enableNetConnect();
});

export function getMockAgent(): MockAgent {
  return mockAgent;
}
