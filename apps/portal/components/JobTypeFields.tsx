'use client';

import { useState } from 'react';
import { ComplaintListInput } from '@/components/ComplaintListInput';
import { FUEL_LEVELS, JOB_TYPES, SPRAY_PANELS, WASH_PACKAGES, type JobType } from '@/lib/workshop/job-types';

const PILL = 'relative flex min-h-12 cursor-pointer flex-col items-start justify-center rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-2 text-left has-[:checked]:border-[var(--ejo-primary)] has-[:checked]:bg-[var(--ejo-primary)]/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ejo-primary)]';
const RADIO = 'absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none opacity-0';
const field = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/**
 * The check-in part of "Open Job Card": what the visit is for (six large
 * buttons), then only the fields that kind of visit needs. Spraying asks for
 * the colour and panels; a car wash needs only the package (the quick
 * check-in); a service needs the mileage. The reason for the visit is written
 * for a car wash, a service or a spraying job when left blank.
 */
export function JobTypeFields({ initialType = 'REPAIR', initialComplaints, initialMileage }: { initialType?: JobType; initialComplaints?: string[]; initialMileage?: number | null }) {
  const [type, setType] = useState<JobType>(initialType);
  const quick = type === 'CAR_WASH';
  const reasonOptional = type === 'CAR_WASH' || type === 'SERVICE' || type === 'SERVICE_AND_REPAIR' || type === 'SPRAYING';
  return (
    <>
      <fieldset>
        <legend className={label}>What is this visit for?</legend>
        <div className="grid grid-cols-2 gap-2 text-sm text-[var(--ejo-text)] sm:grid-cols-3">
          {JOB_TYPES.map((t) => (
            <label key={t.key} className={PILL} title={t.hint}>
              <input type="radio" name="jobType" value={t.key} checked={type === t.key} onChange={() => setType(t.key)} data-testid={`job-type-${t.key.toLowerCase()}`} className={RADIO} />
              <span className="font-semibold">{t.label}</span>
              <span className="text-[11px] leading-snug text-[var(--ejo-text-muted)]">{t.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {type === 'CAR_WASH' ? (
        <div>
          <label htmlFor="wash-package" className={label}>Car wash package <span className="text-[var(--ejo-error)]">*</span></label>
          <select id="wash-package" name="washPackage" required className={field} defaultValue="">
            <option value="" disabled>Choose…</option>
            {WASH_PACKAGES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
      ) : null}

      {type === 'SPRAYING' ? (
        <fieldset className="space-y-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] p-3">
          <legend className="px-1 text-xs font-semibold text-[var(--ejo-text)]">Spraying</legend>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="spray-colour" className={label}>Colour <span className="text-[var(--ejo-error)]">*</span></label><input id="spray-colour" name="sprayColour" required maxLength={60} placeholder="e.g. Pearl white" className={field} /></div>
            <div><label htmlFor="spray-code" className={label}>Paint code</label><input id="spray-code" name="sprayColourCode" maxLength={30} placeholder="e.g. 070" className={field} /></div>
          </div>
          <p className={label}>Panels to spray <span className="text-[var(--ejo-error)]">*</span></p>
          <div className="grid grid-cols-2 gap-1.5 text-sm">
            {SPRAY_PANELS.map((p) => (
              <label key={p.key} className="flex min-h-9 items-center gap-2 rounded-[var(--ejo-radius-md)] px-1 hover:bg-[var(--ejo-bg)]">
                <input type="checkbox" name="sprayPanels" value={p.key} className="h-4 w-4" /> {p.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {!quick ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="job-card-mileage" className={label}>Mileage (km){type === 'SERVICE' || type === 'SERVICE_AND_REPAIR' ? <span className="text-[var(--ejo-error)]"> *</span> : null}</label>
            <input id="job-card-mileage" name="mileageAtCheckIn" type="number" inputMode="numeric" min={0} defaultValue={initialMileage ?? undefined} required={type === 'SERVICE' || type === 'SERVICE_AND_REPAIR'} className={field} />
          </div>
          <div>
            <label htmlFor="job-card-fuel" className={label}>Fuel level</label>
            <select id="job-card-fuel" name="fuelLevel" className={field} defaultValue="">
              <option value="">Not noted</option>
              {FUEL_LEVELS.map((f, i) => <option key={f} value={i}>{f}</option>)}
            </select>
          </div>
        </div>
      ) : null}

      <div>
        <label htmlFor="job-card-items" className={label}>Items left in the vehicle</label>
        <input id="job-card-items" name="itemsInVehicle" maxLength={500} placeholder="e.g. Spare tyre, jack, car documents, phone charger" className={field} />
      </div>

      <div>
        <p className={label}>{quick ? 'Anything else the customer asked for' : 'Reasons for the visit'}{reasonOptional ? null : <span className="text-[var(--ejo-error)]"> *</span>}</p>
        <ComplaintListInput key={reasonOptional ? 'optional' : 'required'} initial={initialComplaints} required={!reasonOptional} placeholder={type === 'DIAGNOSTICS' ? 'e.g. Check engine light on, car jerks' : reasonOptional ? 'Optional' : undefined} />
      </div>
    </>
  );
}
