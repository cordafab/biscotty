# PRD: Bounded mutation requests

Status: Implemented for version `0.1.2`; controlled checks passed; native release verification remains incomplete.
Owner: Integration agent.
Paths: `src/backend/gateway/`, `tests/harness/gateway.test.js`, and affected action tests.
Dependencies: [shared interfaces](01-module-interfaces.md) and [publishing](09-publishing-0.1.md).

## Purpose and scope

Prevent capacity rejection from executing a privileged action.
Bound retained mutation responses without storing complete request payloads.
Preserve sender checks, request identity, revision checks, and single-operation behavior.

## Interfaces and limits

Public request and response envelopes remain unchanged.
`REQUEST_CAPACITY` identifies admission failure before execution.
Callers can retry after pending changes finish.

| Resource | Production limit |
| --- | --- |
| Retained mutation requests | 128 entries. |
| Reserved and completed cache data | 8 MiB. |
| Completed response lifetime | At most 15 minutes. |
| Request fingerprint | SHA-256 digest of the complete serialized request. |

Byte budgets count encoded responses, identity metadata, and pending response reservations.
Runtime object overhead is additional.

Tests can inject smaller limits and a controlled clock through the private constructor.
The backend reserves response capacity before execution.
Completed entries expire or are evicted before rejecting work because of in-flight capacity.
In-flight entries retain their identity until the action settles.
Ordinary revision and consumed-token checks protect successful mutations after completed-response eviction.

## Requirements

- **DEDUP-01.** The gateway MUST decide mutation admission before scheduling or invoking its handler.
- **DEDUP-02.** Capacity rejection MUST return `REQUEST_CAPACITY` with zero handler calls for that request.
- **DEDUP-03.** Concurrent identical accepted requests MUST share one handler execution and response.
- **DEDUP-04.** A retained request identifier reused with different content MUST fail without another handler call.
- **DEDUP-05.** The gateway MUST enforce its entry, byte, and completed-lifetime limits.
- **DEDUP-06.** The cache MUST retain request digests instead of complete serialized request payloads.
- **DEDUP-07.** The cache MUST reserve capacity for the action's bounded response before handler execution.
- **DEDUP-08.** Capacity cleanup MUST NOT evict an in-flight accepted request.
- **DEDUP-09.** Expired or evicted successful requests MUST still pass revision and token checks before any later execution.
- **DEDUP-10.** Rejected handlers MUST release their reservation into a bounded completed error response.
- **DEDUP-11.** Capacity guidance MUST describe waiting for pending work instead of closing the popup.
- **DEDUP-12.** Deduplication state MUST remain temporary backend memory without persistent storage or logging.

## Failure behavior

Sender and envelope failures precede capacity reservation.
An admission failure leaves protection, operation state, and native storage unchanged.
An accepted handler failure uses the existing safe error envelope.
Cache eviction does not bypass backend validation or imply that a failed action succeeded.
A lost response still requires saved-state refresh before another mutation attempt.

## Acceptance criteria

| Case | Expected result |
| --- | --- |
| DEDUP-A01 | Entry saturation by pending requests rejects the next request without invoking its handler. |
| DEDUP-A02 | Byte saturation by reserved responses rejects the next request without invoking its handler. |
| DEDUP-A03 | Concurrent duplicate requests execute once; changed content with the same retained identifier fails. |
| DEDUP-A04 | Completed expiry or eviction permits new work while pending duplicates remain deduplicated. |
| DEDUP-A05 | Handler failure returns one safe cached error and releases unused reservation capacity. |
| DEDUP-A06 | Replaying an evicted successful configuration request cannot apply the change again. |
| DEDUP-A07 | Large request payloads do not remain as cache fingerprints after responses settle. |
| DEDUP-A08 | Existing sender rejection, revision conflicts, imports, popup saves, and single-burn tests still pass. |

## Completion evidence

Exercise admission and response behavior through the public dispatcher.
Use real configuration handlers to verify replay safety after eviction.
Record test results in the [verification record](../implementation/verification.md).
