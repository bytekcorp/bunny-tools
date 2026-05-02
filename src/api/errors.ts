// Typed error hierarchy for bunny-tools.
//
// BunnyApiError wraps Bunny's `{ ErrorKey, Field, Message }` JSON envelope and
// also accepts plain-text bodies (some endpoints return that on 4xx).

export class BunnyError extends Error {
  override readonly name: string = 'BunnyError';
}

export class AuthError extends BunnyError {
  override readonly name = 'AuthError';
}

export class ConfigError extends BunnyError {
  override readonly name = 'ConfigError';
}

export class ValidationError extends BunnyError {
  override readonly name = 'ValidationError';
}

export class BunnyApiError extends BunnyError {
  override readonly name = 'BunnyApiError';
  readonly status: number;
  readonly errorKey: string | undefined;
  readonly field: string | undefined;

  constructor(opts: {
    message: string;
    status: number;
    errorKey?: string;
    field?: string;
  }) {
    super(opts.message);
    this.status = opts.status;
    this.errorKey = opts.errorKey;
    this.field = opts.field;
  }
}

export type BunnyErrorEnvelope = {
  ErrorKey?: string;
  Field?: string;
  Message?: string;
};

export function parseBunnyErrorBody(
  status: number,
  body: string,
): BunnyApiError {
  // Try JSON envelope first; fall back to plain-text body.
  try {
    const parsed = JSON.parse(body) as BunnyErrorEnvelope;
    if (parsed && typeof parsed === 'object') {
      return new BunnyApiError({
        message: parsed.Message ?? `HTTP ${status}`,
        status,
        errorKey: parsed.ErrorKey,
        field: parsed.Field,
      });
    }
  } catch {
    // not JSON — fall through
  }
  const trimmed = body.trim();
  return new BunnyApiError({
    message: trimmed.length > 0 ? trimmed : `HTTP ${status}`,
    status,
  });
}
