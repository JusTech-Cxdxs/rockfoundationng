'use client';

import { useEffect, useRef, useState } from 'react';
import { LoadingLink } from './LoadingLink';
import { CustomerSearchField } from './CustomerSearchField';
import {
  listVehiclesForCustomer,
  listEligibleSupervisors,
  type VehicleSearchResult,
  type EligibleSupervisor,
} from '@/lib/actions/workshop';

type AsyncState = 'idle' | 'loading' | 'success' | 'error';

/**
 * Customer → Vehicle → Supervisor picker for new Job Cards and Vehicle
 * Services. Once a vehicle is chosen, the people who may supervise the
 * job are listed (lib/duty-roles.ts).
 */
export function CustomerVehiclePicker({
  initialCustomer,
  initialVehicleId,
}: {
  /** Pre-filled customer (an Enyo draft, checked on the server against the person's organisation). */
  initialCustomer?: { id: string; label: string } | null;
  /** Pre-filled vehicle: chosen once that customer's vehicles have loaded, if it is one of them. */
  initialVehicleId?: string | null;
} = {}) {
  const [customerId, setCustomerId] = useState(initialCustomer?.id ?? '');
  const pendingVehicleId = useRef(initialVehicleId ?? '');
  const [vehicles, setVehicles] = useState<VehicleSearchResult[]>([]);
  const [vehiclesState, setVehiclesState] = useState<AsyncState>('idle');
  const vehiclesRequestId = useRef(0);

  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [supervisors, setSupervisors] = useState<EligibleSupervisor[]>([]);
  const [usingFallbackSupervisors, setUsingFallbackSupervisors] = useState(false);
  const [supervisorsState, setSupervisorsState] = useState<AsyncState>('idle');
  const supervisorsRequestId = useRef(0);

  useEffect(() => {
    if (!customerId) {
      setVehicles([]);
      setVehiclesState('idle');
      setSelectedVehicleId('');
      return;
    }
    const requestId = ++vehiclesRequestId.current;
    setVehiclesState('loading');
    listVehiclesForCustomer(customerId)
      .then((found) => {
        if (requestId !== vehiclesRequestId.current) return;
        setVehicles(found);
        setVehiclesState('success');
        // A pre-filled vehicle wins once, if it belongs to this customer; otherwise
        // the first one (the browser's own default for a <select>).
        const wanted = pendingVehicleId.current && found.some((v) => v.id === pendingVehicleId.current) ? pendingVehicleId.current : '';
        pendingVehicleId.current = '';
        setSelectedVehicleId(wanted || (found[0]?.id ?? ''));
      })
      .catch(() => {
        if (requestId !== vehiclesRequestId.current) return;
        setVehicles([]);
        setVehiclesState('error');
        setSelectedVehicleId('');
      });
  }, [customerId]);

  useEffect(() => {
    if (!selectedVehicleId) {
      setSupervisors([]);
      setSupervisorsState('idle');
      return;
    }
    const requestId = ++supervisorsRequestId.current;
    setSupervisorsState('loading');
    listEligibleSupervisors()
      .then((result) => {
        if (requestId !== supervisorsRequestId.current) return;
        setSupervisors(result.supervisors);
        setUsingFallbackSupervisors(result.usingFallback);
        setSupervisorsState('success');
      })
      .catch(() => {
        if (requestId !== supervisorsRequestId.current) return;
        setSupervisors([]);
        setSupervisorsState('error');
      });
  }, [selectedVehicleId]);

  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Customer</label>
        <CustomerSearchField required onSelect={setCustomerId} defaultValue={initialCustomer?.id} defaultLabel={initialCustomer?.label} />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Vehicle</label>
        {!customerId ? (
          <p className="rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
            Select a customer above first.
          </p>
        ) : vehiclesState === 'loading' ? (
          <p className="flex items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading this customer&apos;s vehicles…
          </p>
        ) : vehiclesState === 'error' ? (
          <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-3 py-2 text-xs text-[var(--ejo-error)]">
            Could not load this customer&apos;s vehicles — try selecting them again.
          </p>
        ) : vehicles.length === 0 ? (
          <p className="rounded-[var(--ejo-radius-md)] border border-dashed border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
            This customer has no registered vehicles yet.{' '}
            <LoadingLink href="/workshop/vehicles" className="text-[var(--ejo-primary)] underline">
              Register one
            </LoadingLink>{' '}
            first.
          </p>
        ) : (
          <select
            name="vehicleId"
            required
            value={selectedVehicleId}
            onChange={(e) => setSelectedVehicleId(e.target.value)}
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plateNumber || v.chassisNumber} — {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
              </option>
            ))}
          </select>
        )}
        <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
          Only this customer&apos;s vehicles are listed.
        </p>
      </div>

      {selectedVehicleId ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
            Assign to supervisor <span className="text-[var(--ejo-error)]">*</span>
          </label>
          {supervisorsState === 'loading' ? (
            <p className="flex items-center gap-2 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-xs text-[var(--ejo-text-muted)]">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Loading eligible supervisors…
            </p>
          ) : supervisorsState === 'error' ? (
            <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-3 py-2 text-xs text-[var(--ejo-error)]">
              Could not load eligible supervisors — try selecting the vehicle again.
            </p>
          ) : supervisors.length === 0 ? (
            <p className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-error)]/30 bg-[var(--ejo-error)]/5 px-3 py-2 text-xs text-[var(--ejo-error)]">
              No eligible supervisor is currently active — a Job Card cannot be opened
              until at least one exists.
            </p>
          ) : (
            <select
              name="supervisorId"
              required
              defaultValue=""
              className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
            >
              <option value="" disabled>Select a supervisor…</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          )}
          {supervisorsState === 'success' && usingFallbackSupervisors ? (
            <p className="mt-1 text-[11px] text-[var(--ejo-warning)]">
              Nobody who can supervise Job Cards is set up yet, so the platform administrators are listed
              instead. Add an Owner or Front Desk colleague under People.
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
              They&apos;ll be emailed to come inspect the vehicle and begin the assessment.
            </p>
          )}
        </div>
      ) : null}
    </>
  );
}
