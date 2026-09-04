import assert from 'assert';
import { makeCookieOptions } from '../routes/auth';

const originalNodeEnv = process.env.NODE_ENV;
const originalRender = process.env.RENDER;
const originalSameSite = process.env.AUTH_COOKIE_SAME_SITE;

process.env.NODE_ENV = 'production';
process.env.RENDER = 'true';
delete process.env.AUTH_COOKIE_SAME_SITE;
let options = makeCookieOptions();
assert.equal(options.sameSite, 'lax');
assert.equal(options.secure, true);
assert.equal(options.httpOnly, true);

process.env.AUTH_COOKIE_SAME_SITE = 'none';
options = makeCookieOptions();
assert.equal(options.sameSite, 'none');
assert.equal(options.secure, true);

process.env.NODE_ENV = 'development';
process.env.RENDER = 'false';
process.env.AUTH_COOKIE_SAME_SITE = 'strict';
options = makeCookieOptions();
assert.equal(options.sameSite, 'strict');
assert.equal(options.secure, false);

if (originalNodeEnv == null) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
if (originalRender == null) delete process.env.RENDER; else process.env.RENDER = originalRender;
if (originalSameSite == null) delete process.env.AUTH_COOKIE_SAME_SITE; else process.env.AUTH_COOKIE_SAME_SITE = originalSameSite;

console.log('Authentication cookie configuration checks passed.');
