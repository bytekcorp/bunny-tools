// core/containers — Magic Containers app CRUD. UI-free.

import { createAccountClient } from '../api/account.js';
import type { ContainerApp } from '../api/account.js';
import { resolveCredential } from '../config/credential-resolver.js';

function client() {
  return createAccountClient({ resolveCredential: (s) => resolveCredential(s) });
}

export async function listApps(): Promise<ContainerApp[]> {
  return client().listContainerApps();
}

export async function getApp(id: string): Promise<ContainerApp> {
  return client().getContainerApp(id);
}

export type CreateAppInput = {
  name: string;
  image?: string;
  region?: string;
  port?: number;
  env?: Record<string, string>;
};

export async function createApp(input: CreateAppInput): Promise<ContainerApp> {
  return client().createContainerApp({
    Name: input.name,
    ...(input.image ? { Image: input.image } : {}),
    ...(input.region ? { Region: input.region } : {}),
    ...(input.port !== undefined ? { Port: input.port } : {}),
    ...(input.env ? { Environment: input.env } : {}),
  });
}

export async function deleteApp(id: string): Promise<void> {
  await client().deleteContainerApp(id);
}
