/**
 * Writes docs/WHATSAPP_TEMPLATES.md from the template catalogue
 * (packages/utils/src/whatsapp-templates.ts):
 *   npm run whatsapp:templates-doc
 * tests/whatsapp-cloud.test.ts fails while the file is out of date.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderTemplatesDoc } from '@ejo/utils/whatsapp-templates';

const path = join(__dirname, '..', '..', '..', 'docs', 'WHATSAPP_TEMPLATES.md');
writeFileSync(path, renderTemplatesDoc());
console.log(`Wrote ${path}`);
