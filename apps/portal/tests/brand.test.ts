/** The platform's name lives in one place (packages/enyo/src/brand.ts) and is used everywhere. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { appShortName, EMBLEM, LOGO, PLATFORM } from '../lib/brand';

const REPO = join(__dirname, '..', '..', '..', '..');

test('the brand file is copied unchanged into both apps (npm run brand:sync)', () => {
  const src = readFileSync(join(REPO, 'packages/enyo/src/brand.ts'), 'utf8');
  assert.equal(readFileSync(join(REPO, 'apps/portal/lib/brand.ts'), 'utf8'), src);
  assert.equal(readFileSync(join(REPO, 'apps/website/lib/brand.ts'), 'utf8'), src);
});

test('no screen, email, print-out or PDF spells the platform name itself', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (['node_modules', '.next', '.test-out', 'e2e', 'tests'].includes(f)) continue;
      if (statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(f) || /brand\.ts$/.test(f)) continue;
      const code = readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/['"`>]\s*Powered by EJO|EJO 100|EJO Workshop Platform/.test(code)) offenders.push(p.slice(REPO.length + 1));
    }
  };
  for (const app of ['apps/portal', 'apps/website', 'packages/enyo/src']) walk(join(REPO, app));
  assert.deepEqual(offenders, []);
  assert.equal(PLATFORM.poweredBy, `Powered by ${PLATFORM.name} · ${PLATFORM.makerShort}`);
  assert.equal(PLATFORM.poweredBy, 'Powered by EJO · JusTech');
});

test('the installed app gets a short name: the organisation\'s initials, or the one set', () => {
  assert.equal(appShortName('Lagos Fleet Services'), 'LFS');
  assert.equal(appShortName('Acme'), 'Acme');
  assert.equal(appShortName('Bank of the North West Region'), 'BNWR');
  assert.equal(appShortName('Lagos Fleet Services', 'Fleet'), 'Fleet');
});
test('the workshop’s logos are in both apps, used as published, and the brand colours are defined once', () => {
  for (const app of ['portal', 'website']) {
    for (const f of ['logo.png', 'emblem.png']) assert.ok(statSync(join(REPO, 'apps', app, 'public', 'brand', f)).size > 1000, `${app}: ${f}`);
    assert.equal(readFileSync(join(REPO, 'apps', app, 'public', 'brand', 'logo.png')).toString('base64'), readFileSync(join(REPO, 'apps/portal/public/brand/logo.png')).toString('base64'));
    const css = readFileSync(join(REPO, 'apps', app, 'app', 'globals.css'), 'utf8');
    for (const t of ['--brand-blue: #3e4095', '--brand-red: #ec3237', '--brand-red-web: #dd3333', '--whatsapp: #25d366']) assert.ok(css.includes(t), `${app}: ${t}`);
    assert.match(css, /var\(--font-roboto\)/, `${app}: Roboto`);
    assert.doesNotMatch(css, /#f09e2c|#d6890b|#0a1628/i, `${app}: none of the previous edition's colours`);
  }
  assert.deepEqual([LOGO.width, LOGO.height, EMBLEM.width, EMBLEM.height], [720, 172, 512, 512]);
});
