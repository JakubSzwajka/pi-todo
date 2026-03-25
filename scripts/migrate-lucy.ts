#!/usr/bin/env tsx
/**
 * One-time migration: Todoist 🤖 Lucy project → pi-todo
 */
import { readStore, writeStore, generateId } from '../src/store.js';
import type { Task } from '../src/types.js';

const now = new Date().toISOString();
const store = readStore();

function task(fields: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
  return { id: generateId(), createdAt: now, updatedAt: now, ...fields };
}

// ── 1. HighFive: refactor synt batch composer ─────────────────────────────────

const hf1 = task({
  title: '[HighFive] refactor synt batch composer',
  tags: ['highfive'],
  priority: 3,
  status: 'in_progress',
  parentId: undefined,
  description: `Branch: feat/refactor-synt-batch-composer
Repo: /Users/kuba.szwajka/DEV/sofomo/zoomph/highfive-models
PR: #516 Refactor - synt batch composer

## Current status
- Kept the typed refactor for synthetic data/compositor instead of restoring tuple-based backwards compatibility
- Updated tests to match the new typed model (BoundingBox / LogoPlacement / CompositeLogo)
- Restored package export behavior in compositor/__init__.py with lazy LogoCompositor loading to avoid circular imports
- make test now passes all refactor-related tests

## Test result
- 768 passed
- 4 failed

## Remaining failures
- tests/test_models.py::test_correctness[...] x3
- tests/test_models.py::test_predict_augment
Root cause: external MLflow/auth access issue — endpoints return 403 Forbidden / sign-in page for model/artifact fetches

## Changed files
- highfive_models/data_processing/synthetic_data/compositor/__init__.py
- highfive_models/data_processing/synthetic_data/compositor/types.py
- highfive_models/data_processing/synthetic_data/compositor/compositor.py
- highfive_models/data_processing/synthetic_data/label_generator.py
- tests/data_processing/synthetic_data/test_compositor.py
- tests/data_processing/synthetic_data/test_label_generator.py`,
  log: [{
    at: now,
    author: 'kuba',
    text: 'Next: decide whether to commit/push refactor-aligned test update. Investigate MLflow auth only if needed — not caused by this refactor.',
  }],
});

// ── 2. SnapCap: automatic certification verification ──────────────────────────

const sc1 = task({
  title: '[SnapCap] automatic certification verification',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: undefined,
  description: `Branch: TBD

## Problem
Captioners have certifications stored as capabilities, and there appears to be certification verification logic or a scraper in the codebase that is not properly hooked into an admin workflow. As a result, certification verification is not easy to trigger operationally when admins need it.

## Goal
Hook the existing certification verification flow into a usable admin-triggered path so admins can run certification verification for a captioner manually and see the outcome.

## Scope
- Confirm the existing certification verification service/scraper path and current gaps
- Wire the verification flow into an admin-triggerable backend path
- Return useful verification results to the admin caller
- Add coverage for the manual admin-triggered flow

## Key cases
- Admin triggers certification verification for a captioner manually
- Existing certification capabilities are checked and verification results are updated consistently
- The response shows attempted certifications, verified count, pending count, and errors

## Out of scope
- Full automation or background scheduling of certification verification
- Reworking the overall capabilities or verifications data model
- Building a large new admin UX beyond using backend/admin endpoints

## Notes
Relevant files: snapcap/api/routes/private/admin/capabilities.py and captioner certification verification code under snapcap/modules/domain/captioners/`,
  log: [],
});

const sc1a = task({
  title: '[SnapCap] confirm existing certification verification service and current gaps',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc1.id,
  description: undefined,
  log: [],
});

const sc1b = task({
  title: '[SnapCap] wire manual admin trigger for certification verification',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc1.id,
  description: undefined,
  log: [],
});

const sc1c = task({
  title: '[SnapCap] return verification results cleanly and add coverage',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc1.id,
  description: undefined,
  log: [],
});

// ── 3. SnapCap: expose referral code validation errors ────────────────────────

const sc2 = task({
  title: '[SnapCap] expose referral code validation errors',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: undefined,
  description: `Branch: TBD

## Problem
When a referral code is wrong, current flows only expose a generic valid/invalid outcome. This hides why the code failed during validation or role setup, which makes the UX vague and harder to debug.

## Goal
Expose the reason a referral code is invalid so callers can surface useful feedback during referral code validation and when applying the code during role setup.

## Scope
- Identify the current referral validation and apply-code flows
- Return structured error reasons instead of only a boolean/generic failure
- Cover both standalone referral validation and the role setup flow that applies the code
- Add tests for the main invalid-code scenarios

## Key cases
- Referral code not found
- Referral code expired or inactive
- Self-referral is rejected with a specific reason
- Code cannot be applied because the user already used a referral code
- Role setup exposes the same useful referral error reason instead of a generic failure

## Out of scope
- Reworking referral business rules
- Building a large new referral admin interface
- Changing credit amounts or redemption semantics

## Notes
Relevant files: snapcap/api/routes/private/referral.py, snapcap/modules/domain/referral/facade.py, and snapcap/modules/processes/user_lifecycle/account_setup_manager.py`,
  log: [],
});

const sc2a = task({
  title: '[SnapCap] map current referral validation and apply-code failure paths',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc2.id,
  description: undefined,
  log: [],
});

const sc2b = task({
  title: '[SnapCap] expose structured referral validation errors from the referral endpoint',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc2.id,
  description: undefined,
  log: [],
});

const sc2c = task({
  title: '[SnapCap] expose referral failure reasons during role setup and add coverage',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc2.id,
  description: undefined,
  log: [],
});

// ── 4. SnapCap: booking document size setting via feature flags ───────────────

const sc3 = task({
  title: '[SnapCap] booking document size setting via feature flags',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: undefined,
  description: `Branch: TBD
PRD: docs/prds/booking-document-size-setting/README.md
Tasks: docs/prds/booking-document-size-setting/tasks.md

## Problem
The maximum total size of documents uploaded to a booking is currently defined in code as CONFIG.max_doc_size_in_bytes_per_booking. Changing it requires a backend release, even when the change is just an operational or business adjustment.

## Goal
Allow admins to change the booking document size limit via the existing feature flag mechanism, keep the code config as fallback, and expose the effective value to the UI through metadata.

## Scope
- Add a config-style feature flag key for booking document size
- Resolve the effective limit in request config with fallback to static config
- Use the effective limit in booking document upload validation
- Expose the effective limit via metadata in bytes and megabytes
- Cover default and override behavior with tests

## Key cases
- Global override changes the limit without a deploy
- Per-user override affects the requester's effective limit and metadata response
- No override falls back to CONFIG.max_doc_size_in_bytes_per_booking

## Out of scope
- Building a separate runtime settings module
- Broad cleanup or renaming of the feature flag system
- Moving other config values as part of this change`,
  log: [],
});

const sc3a = task({
  title: '[SnapCap] add booking document size to resolved request config',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc3.id,
  description: undefined,
  log: [],
});

const sc3b = task({
  title: '[SnapCap] use resolved limit in booking document validation',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc3.id,
  description: undefined,
  log: [],
});

const sc3c = task({
  title: '[SnapCap] expose the effective limit in metadata and cover it with flow tests',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc3.id,
  description: undefined,
  log: [],
});

// ── 5. SnapCap: unify event publishing ───────────────────────────────────────

const sc4 = task({
  title: '[SnapCap] Unify event publishing — single EventPublisher.record() API',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: undefined,
  description: `Branch: TBD
Research report: docs/research/domain-event-publishing-location/
Final proposal: docs/research/domain-event-publishing-location/13-final-proposal.md

## Problem
SnapCap has two event publishing mechanisms (EventPublishableMixin.publish() and EventDispatcher.publish()) with no clear rule for when to use which. This causes recurring confusion, inconsistent entity association, a selectin performance problem on event relationships, and dead code (_event_record, @event decorator).

## Goal
One publishing API (EventPublisher.record()), one transaction story, one way to associate events with entities.

## Scope
- Build unified EventPublisher.record(event, entity=optional) API
- Remove EventPublishableMixin ORM relationship from all models
- Remove EventDispatcher.publish() method (keep handler registry)
- Remove dead _event_record / @event decorator code
- Migrate all .publish() call sites to EventPublisher.record()
- Update tests that read entity.domain_events to query outbox directly
- Document the simplified decision rule

## Key cases
- Entity state transitions (e.g., confirm()) call EventPublisher.record() inside the method
- Process orchestration events (e.g., BookingCanceled) call EventPublisher.record() from the process
- System/infra events (e.g., ProviderResourceLockChanged) call EventPublisher.record() without entity
- BookingCompleted stays in processes — NOT moved into entity (proven wrong by existing tests)

## Out of scope
- Event schema versioning, handler ordering fixes, optimistic locking, full UoW/collector drain pattern

## Notes
Most changes are mechanical 1:1 substitutions of .publish( → EventPublisher.record(
The lazy='selectin' problem disappears entirely when the ORM relationship is removed`,
  log: [],
});

const sc4a = task({
  title: 'Build EventPublisher.record() unified API',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc4.id,
  description: `Create snapcap/tools/events/event_publisher.py with single record() method. Requires active transaction (raise if none). Accepts entity= object or explicit entity_id/entity_type. Captures author_id from context. Registers inbox handlers. No ORM relationship — direct db.add().`,
  log: [],
});

const sc4b = task({
  title: 'Migrate entity.publish() call sites to EventPublisher.record()',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc4.id,
  description: `Mechanical 1:1 replacement across all modules. ~30 call sites in bookings (model, facade, processes, wrap-up), party, organizations. Replace entity.publish(Event(...)) → EventPublisher.record(Event(...), entity=entity).`,
  log: [],
});

const sc4c = task({
  title: 'Remove EventPublishableMixin and EventDispatcher.publish()',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc4.id,
  description: `Delete publish() method and domain_events relationship from EventPublishableMixin. Remove mixin from all model class hierarchies. Delete EventDispatcher.publish() method (keep subscribe/get_handlers). Optionally rename EventDispatcher → EventHandlerRegistry for clarity.`,
  log: [],
});

const sc4d = task({
  title: 'Migrate EventDispatcher.publish() call sites to EventPublisher.record()',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc4.id,
  description: `~6 call sites: availability, google_calendar, analytics, payments, admin routes. Replace await EventDispatcher.publish(Event(...)) → await EventPublisher.record(Event(...), entity_id=..., entity_type=...). Fix the random entity_id problem by passing real IDs where applicable.`,
  log: [],
});

const sc4e = task({
  title: 'Remove dead _event_record and @event decorator',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc4.id,
  description: `Remove _event_record from Entity base class in shared/root.py. Remove @event decorator from tools/events/events.py. Migrate any _event_record usage in CaSchedulerSync to EventPublisher.record().`,
  log: [],
});

const sc4f = task({
  title: 'Update tests — replace entity.domain_events reads with outbox queries',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc4.id,
  description: `Tests that assert booking.domain_events or len(entity.domain_events) must switch to querying DomainEventOutboxModel directly by entity_id. This is the main testing impact of removing the ORM relationship.`,
  log: [],
});

const sc4g = task({
  title: 'Document event publishing decision rule',
  tags: ['snapcap'],
  priority: 1,
  status: 'open',
  parentId: sc4.id,
  description: `Add to AGENTS.md or a new docs/events.md: one API (EventPublisher.record()), authority convention (entity method vs process vs system), the refined rule ("publish from entity only when every invocation implies the same business fact").`,
  log: [],
});

// ── Write all tasks ───────────────────────────────────────────────────────────

store.tasks.push(
  hf1,
  sc1, sc1a, sc1b, sc1c,
  sc2, sc2a, sc2b, sc2c,
  sc3, sc3a, sc3b, sc3c,
  sc4, sc4a, sc4b, sc4c, sc4d, sc4e, sc4f, sc4g,
);

writeStore(store);

console.log(`✓ Migrated ${store.tasks.length} tasks`);
for (const t of store.tasks) {
  const indent = t.parentId ? '    ↳ ' : '  ';
  console.log(`${indent}#${t.id}  ${t.title}`);
}
