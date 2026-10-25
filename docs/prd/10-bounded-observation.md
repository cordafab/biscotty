# PRD: Bounded page observation

Status: Implemented for version `0.1.2`; controlled checks passed; native release verification remains incomplete.
Owner: Track B, integrated by the integration agent.
Paths: `src/backend/firefox/`, `tests/backend/firefox/`, and affected native fixtures.
Dependencies: [backend](03-firefox-backend-and-burner.md), [interfaces](01-module-interfaces.md), and [publishing](09-publishing-0.1.md).

## Purpose and scope

Prevent website activity from creating unlimited queued work, retained hosts, frames, or storage writes.
Preserve navigation identity, current-document attribution, and cookie-protection authorization.
Resource limits are project decisions, not Firefox guarantees.

## Limits

| Resource | Production limit |
| --- | --- |
| Retained tabs | 128 observations. |
| Contacted hosts | 1,024 hosts per observation. |
| Document ancestry | 256 frames per observation. |
| Pending native events | 512 events. |
| One retained record | 256 KiB of encoded JSON. |
| Aggregate retained observations | 4 MiB of encoded JSON, including tab keys. |
| Automatic persistence | One scheduled batch per 250 milliseconds. |

Tests can inject smaller limits through the private constructor.
Reads and explicit invalidation can flush changed state immediately.
One in-flight native event and one storage snapshot can temporarily coexist with the bounded pending state.

## Interfaces and ordering

The observation service retains `ready`, `get(tab)`, and `invalidate()`.
The private adapter replaces per-tab writes with one confirmed aggregate snapshot write.
All state transitions and storage changes pass through one serialized worker.
Native listeners register synchronously and submit only reduced events.
Public coverage remains `{ state, reason }` with existing `observed` and `partial` states.

## Requirements

- **OBS-01.** The observer MUST enforce every production limit in the limits table.
- **OBS-02.** The observer MUST coalesce equivalent pending resource requests within one document and host context.
- **OBS-03.** Request completion outside the main navigation MUST NOT schedule observation work.
- **OBS-04.** Automatic persistence MUST combine changed observations into one aggregate session snapshot.
- **OBS-05.** Unchanged events and repeated reads MUST NOT cause redundant storage writes.
- **OBS-06.** A host or frame limit MUST retain bounded state with explicit partial coverage.
- **OBS-07.** Queue overflow MUST discard queued observations and invalidate their captured navigation contexts.
- **OBS-08.** Tabs discarded after queue overflow MUST return partial coverage until a subsequently observed navigation establishes new coverage.
- **OBS-09.** Tab or byte exhaustion MUST evict old observations and invalidate their captured contexts.
- **OBS-10.** Tab closure, unsupported navigation, and permission loss MUST remove affected observations despite resource saturation.
- **OBS-11.** Restored observations MUST satisfy current size, shape, and privacy limits before use.
- **OBS-12.** Failed snapshot persistence MUST remove previously saved observations or mark local coverage unavailable for restoration.
- **OBS-13.** Observation persistence MUST remain independent of the configuration mutation queue.
- **OBS-14.** Limits MUST NOT modify allow rules, cookie counts within captured groups, or deletion authorization.
- **OBS-15.** A fresh observed navigation MUST establish new coverage after eviction without requiring a previous record for that tab.
- **OBS-16.** Coverage recovery MUST NOT upgrade other documents or restore invalidated navigation tokens.

## Failure behavior

Partial coverage explains omitted activity and offers manual reload guidance.
An evicted observation loses its navigation generation; an old domain token cannot authorize a rule save.
Queue overflow conservatively discards all queued activity instead of guessing lost event order.
Storage failures preserve partial coverage and never establish a new observed claim.
Observation limits do not truncate native cookie enumeration into an apparently successful inventory.

## Acceptance criteria

| Case | Expected result |
| --- | --- |
| OBS-A01 | Repeated identical request bursts have bounded work and no redundant writes after the state is saved. |
| OBS-A02 | Excess distinct hosts or frames stop at their limits and report partial coverage. |
| OBS-A03 | Queue overflow invalidates old generations; subsequent reads and reloads have safe coverage and attribution. |
| OBS-A04 | Tab and byte limits evict old state; closed and unsupported tabs cannot reappear after the worker drains. |
| OBS-A05 | Changed activity is persisted in batches; unchanged reads cause no writes. |
| OBS-A06 | Oversized or malformed restored records cannot produce observed coverage or unbounded retained state. |
| OBS-A07 | Storage and permission failures remove old saved claims and preserve existing cookie-protection behavior. |
| OBS-A08 | Existing redirects, nested frames, same-host reloads, domain paging, and popup rule authorization still pass. |
| OBS-A09 | Fresh navigation after tab or byte eviction recovers coverage; missing starts and storage failures remain partial. |

## Completion evidence

Use controlled public service tests for limits, pending work, storage failures, and token invalidation.
Use disposable Firefox fixtures for native observation and cookie safety.
Record measured stress inputs and results separately from untested browser limits.
The [verification record](../implementation/verification.md) records actual results.
