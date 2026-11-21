/**
 * Every staff tool Enyo may use. All of them are offered to the model for
 * every person: each tool refuses on its own (NOT_PERMITTED-style) when the
 * person lacks the right, so a technician asking for profit gets a kind
 * refusal while the Owner gets the figure. A tool never widens access — it runs
 * the module's own authorised code as the signed-in person.
 *
 * Each area keeps its tools in its own `tools/<area>.ts` file; every file in
 * this folder must be imported here (a unit test checks it).
 *
 * A tool whose module is switched off (lib/modules.ts — the Store) is left
 * out entirely (lib/enyo/edition.ts).
 *
 * General knowledge comes from the shared web look-up (Wikipedia, plus a
 * general search engine when a key is set; read only, nothing from the
 * records is sent); ENYO_WEB_LOOKUP=off removes it.
 */
import { webLookupEnabled, webLookupTool } from '@ejo/enyo';
import type { StaffCtx, StaffTool } from '../types';
import { selectToolNames, slimToolNames } from '../tool-select';
import { editionDescription, toolOn } from '../edition';
import { guideTools } from './guide';
import { workTools } from './work';
import { recordTools } from './records';
import { storeTools } from './store';
import { businessTools } from './business';
import { aftercareTools } from './aftercare';
import { personalTools } from './personal';
import { draftTools } from './drafts';
import { remindersTools } from './reminders';
import { supportTools } from './support';
import { integrityTools } from './integrity';
import { organisationTools } from './organisation';
import { leadershipTools } from './leadership';
import { peopleTools } from './people';

export function staffTools(): StaffTool[] {
  const all: StaffTool[] = [
    ...guideTools,
    ...workTools,
    ...recordTools,
    ...storeTools,
    ...businessTools,
    ...aftercareTools,
    ...personalTools,
    ...draftTools,
    ...remindersTools,
    ...supportTools,
    ...integrityTools,
    ...organisationTools,
    ...leadershipTools,
    ...peopleTools,
    ...(webLookupEnabled() ? [webLookupTool<StaffCtx>()] : []),
  ];
  // Only the modules switched on, with the wording that fits.
  return all.filter((t) => toolOn(t.name)).map((t) => ({ ...t, description: editionDescription(t.name, t.description) }));
}

/**
 * The tools offered for one question: the ones it can need (see
 * tool-select.ts), so each request stays small enough for the model server's
 * per-minute budget. `slim` is the smaller set for a second try.
 */
export function staffToolsFor(message: string, previous = ''): { tools: StaffTool[]; slim: StaffTool[] } {
  const all = staffTools();
  const { names, web } = selectToolNames(message, previous);
  const pick = (ns: string[]) => all.filter((t) => ns.includes(t.name));
  const webTool = web ? all.filter((t) => !names.includes(t.name) && /web/i.test(t.name)) : [];
  return { tools: [...pick(names), ...webTool], slim: pick(slimToolNames(message)) };
}
