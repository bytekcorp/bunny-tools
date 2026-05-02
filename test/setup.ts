import { afterAll, afterEach, beforeAll } from 'vitest';
import nock from 'nock';

// Globally disable real network. Tests must mock everything they need.
beforeAll(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  // Tests may add `nock(...).get(...)` interceptors; ensure they were used.
  // We don't fail on leftover interceptors here so individual tests can
  // assert their own state, but we clean them up.
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});
