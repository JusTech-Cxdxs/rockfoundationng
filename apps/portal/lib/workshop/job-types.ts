/**
 * The kinds of visit a Job Card can be, and what each one asks for at
 * check-in (pure: safe in the browser, on the server and in tests). One Job
 * Card covers every kind: the type decides which fields front desk fills in,
 * whether the next-service count starts, and how the card reads on screen
 * and paper.
 */

export const JOB_TYPES = [
  { key: 'SERVICE', label: 'Service', hint: 'Routine service: oil, filters and checks.', service: true },
  { key: 'REPAIR', label: 'Repair', hint: 'A fault or damage to put right.', service: false },
  { key: 'SERVICE_AND_REPAIR', label: 'Service and repair', hint: 'A routine service plus a repair.', service: true },
  { key: 'DIAGNOSTICS', label: 'Diagnostics', hint: 'Computer diagnostic test to find the fault.', service: false },
  { key: 'SPRAYING', label: 'Spraying', hint: 'Paint work in our spray booth.', service: false },
  { key: 'CAR_WASH', label: 'Car wash', hint: 'Quick check-in: choose the package.', service: false },
] as const;
export type JobType = (typeof JOB_TYPES)[number]['key'];
export const isJobType = (v: unknown): v is JobType => JOB_TYPES.some((t) => t.key === v);
export const jobTypeLabel = (v: string | null | undefined): string => JOB_TYPES.find((t) => t.key === v)?.label ?? 'Repair';
/** A service visit starts the vehicle's next-service count when it is checked out. */
export const isServiceType = (v: string | null | undefined): boolean => JOB_TYPES.find((t) => t.key === v)?.service ?? false;

/** Fuel in eighths of a tank, as front desk sees the gauge. */
export const FUEL_LEVELS = ['Empty', '1/8', '1/4', '3/8', 'Half', '5/8', '3/4', '7/8', 'Full'] as const;
export const fuelLevelLabel = (v: number | null | undefined): string | null => (typeof v === 'number' && v >= 0 && v <= 8 ? FUEL_LEVELS[v]! : null);
export const isFuelLevel = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 8;

export const SPRAY_PANELS = [
  { key: 'FRONT_BUMPER', label: 'Front bumper' }, { key: 'BONNET', label: 'Bonnet' }, { key: 'ROOF', label: 'Roof' },
  { key: 'BOOT', label: 'Boot lid / tailgate' }, { key: 'REAR_BUMPER', label: 'Rear bumper' },
  { key: 'FRONT_LEFT_WING', label: 'Front left wing' }, { key: 'FRONT_RIGHT_WING', label: 'Front right wing' },
  { key: 'FRONT_LEFT_DOOR', label: 'Front left door' }, { key: 'FRONT_RIGHT_DOOR', label: 'Front right door' },
  { key: 'REAR_LEFT_DOOR', label: 'Rear left door' }, { key: 'REAR_RIGHT_DOOR', label: 'Rear right door' },
  { key: 'REAR_LEFT_QUARTER', label: 'Rear left quarter panel' }, { key: 'REAR_RIGHT_QUARTER', label: 'Rear right quarter panel' },
  { key: 'LEFT_SKIRT', label: 'Left side skirt' }, { key: 'RIGHT_SKIRT', label: 'Right side skirt' },
  { key: 'FULL_BODY', label: 'Full body respray' },
] as const;
export type SprayPanel = (typeof SPRAY_PANELS)[number]['key'];
export const isSprayPanel = (v: unknown): v is SprayPanel => SPRAY_PANELS.some((p) => p.key === v);
export const sprayPanelLabels = (keys: readonly string[]): string[] => keys.map((k) => SPRAY_PANELS.find((p) => p.key === k)?.label ?? k);

export const WASH_PACKAGES = [
  { key: 'EXTERIOR', label: 'Exterior wash' },
  { key: 'FULL', label: 'Full wash (inside and out)' },
  { key: 'FULL_ENGINE', label: 'Full wash with engine wash' },
  { key: 'DETAILING', label: 'Interior detailing' },
] as const;
export type WashPackage = (typeof WASH_PACKAGES)[number]['key'];
export const isWashPackage = (v: unknown): v is WashPackage => WASH_PACKAGES.some((p) => p.key === v);
export const washPackageLabel = (v: string | null | undefined): string | null => WASH_PACKAGES.find((p) => p.key === v)?.label ?? null;

export type CheckInInput = {
  jobType: string;
  complaints: string[];
  mileageAtCheckIn?: number | null;
  fuelLevel?: number | null;
  itemsInVehicle?: string | null;
  sprayColour?: string | null;
  sprayColourCode?: string | null;
  sprayPanels?: string[];
  washPackage?: string | null;
};

export type CheckIn = {
  jobType: JobType; isService: boolean; complaints: string[]; fuelLevel: number | null; itemsInVehicle: string | null;
  sprayColour: string | null; sprayColourCode: string | null; sprayPanels: SprayPanel[]; washPackage: WashPackage | null;
};

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Checks what front desk entered for this kind of visit and returns it ready
 * to save, or a plain message saying what to fix. A car wash or a service may
 * leave the reason blank: it is written for them ("Car wash: Full wash").
 */
export function checkIn(input: CheckInInput): CheckIn | string {
  if (!isJobType(input.jobType)) return 'Choose what this visit is for.';
  const type = input.jobType;
  let complaints = input.complaints.map((c) => c.trim()).filter(Boolean);
  if (complaints.some((c) => c.length > 500)) return 'Keep each reason for the visit under 500 characters.';
  const fuelLevel = input.fuelLevel === undefined || input.fuelLevel === null ? null : input.fuelLevel;
  if (fuelLevel !== null && !isFuelLevel(fuelLevel)) return 'Choose the fuel level from the list.';
  const items = clean(input.itemsInVehicle, 500) || null;
  let sprayColour: string | null = null;
  let sprayColourCode: string | null = null;
  let sprayPanels: SprayPanel[] = [];
  let washPackage: WashPackage | null = null;
  if (type === 'SPRAYING') {
    sprayColour = clean(input.sprayColour, 60) || null;
    sprayColourCode = clean(input.sprayColourCode, 30) || null;
    sprayPanels = [...new Set((input.sprayPanels ?? []).filter(isSprayPanel))];
    if (!sprayColour) return 'Write the colour to be sprayed (for example "Pearl white").';
    if (!sprayPanels.length) return 'Tick the panels to be sprayed.';
    if (sprayPanels.includes('FULL_BODY')) sprayPanels = ['FULL_BODY'];
    if (!complaints.length) complaints = [`Spraying: ${sprayPanelLabels(sprayPanels).join(', ')} in ${sprayColour}`];
  }
  if (type === 'CAR_WASH') {
    if (!isWashPackage(input.washPackage)) return 'Choose the car wash package.';
    washPackage = input.washPackage;
    if (!complaints.length) complaints = [`Car wash: ${washPackageLabel(washPackage)}`];
  }
  if (!complaints.length && (type === 'SERVICE' || type === 'SERVICE_AND_REPAIR')) complaints = ['Routine service'];
  if (!complaints.length) return type === 'DIAGNOSTICS' ? 'Write what the customer noticed (the symptoms) so the test can start there.' : 'Write at least one reason for the visit, in the customer’s words.';
  if (isServiceType(type) && (input.mileageAtCheckIn === undefined || input.mileageAtCheckIn === null)) return 'Enter the mileage at check-in: the next service is worked out from it.';
  return { jobType: type, isService: isServiceType(type), complaints, fuelLevel, itemsInVehicle: items, sprayColour, sprayColourCode, sprayPanels, washPackage };
}
