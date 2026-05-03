import { describe, expect, it } from 'vitest';
import { contentTypeFor } from '../../src/util/content-type.js';

describe('contentTypeFor', () => {
  it('looks up known extensions from mime-types', () => {
    expect(contentTypeFor('app.js')).toMatch(/javascript/);
    expect(contentTypeFor('app.mjs')).toMatch(/javascript/);
    expect(contentTypeFor('icon.svg')).toBe('image/svg+xml');
    expect(contentTypeFor('font.woff2')).toBe('font/woff2');
  });

  it('covers extensions previously missing from the manual table', () => {
    expect(contentTypeFor('site.webmanifest')).toMatch(/manifest/);
    expect(contentTypeFor('module.wasm')).toBe('application/wasm');
    expect(contentTypeFor('clip.opus')).toBe('audio/ogg');
  });

  it('appends charset=utf-8 to text-y types only', () => {
    expect(contentTypeFor('page.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeFor('style.css')).toBe('text/css; charset=utf-8');
    expect(contentTypeFor('app.js')).toMatch(/charset=utf-8/);
    // Binary types should NOT get a charset.
    expect(contentTypeFor('photo.png')).toBe('image/png');
    expect(contentTypeFor('clip.mp4')).toBe('video/mp4');
  });

  it('falls back to application/octet-stream for unknown / extensionless paths', () => {
    expect(contentTypeFor('mystery.qqq')).toBe('application/octet-stream');
    expect(contentTypeFor('Makefile')).toBe('application/octet-stream');
    expect(contentTypeFor('no-ext')).toBe('application/octet-stream');
  });

  it('honors bunny.json mimeTypes overrides (dot-prefix keys)', () => {
    const overrides = {
      '.mjs': 'application/javascript',
      '.foo': 'application/x-foo',
    };
    // mime-db lists application/javascript as UTF-8; charset gets appended.
    expect(contentTypeFor('app.mjs', overrides)).toBe('application/javascript; charset=utf-8');
    // Custom types not in mime-db's charset table are passed through as-is.
    expect(contentTypeFor('thing.foo', overrides)).toBe('application/x-foo');
    // Unrelated extensions still use the default lookup.
    expect(contentTypeFor('app.js', overrides)).toMatch(/javascript/);
  });

  it('overrides take precedence over mime-types defaults', () => {
    const overrides = { '.html': 'application/xhtml+xml' };
    expect(contentTypeFor('page.html', overrides)).toMatch(/xhtml/);
  });
});
