import assert from 'node:assert/strict';
import test from 'node:test';

import {
  stateAsyncConfirmPaidEnqueueSchema,
  stateAsyncJobIdParamSchema,
  stateCommandSchema,
} from './state-command.validator.js';

test('stateAsyncConfirmPaidEnqueueSchema aceita draft válido', () => {
  const parsed = stateAsyncConfirmPaidEnqueueSchema.parse({
    draftId: 'draft-123',
    commandId: 'cmd-123',
  });

  assert.equal(parsed.draftId, 'draft-123');
  assert.equal(parsed.commandId, 'cmd-123');
});

test('stateAsyncConfirmPaidEnqueueSchema rejeita draft vazio', () => {
  assert.throws(() => stateAsyncConfirmPaidEnqueueSchema.parse({ draftId: '   ' }));
});

test('stateAsyncJobIdParamSchema valida id de job obrigatório', () => {
  const parsed = stateAsyncJobIdParamSchema.parse({ jobId: 'job-xyz' });
  assert.equal(parsed.jobId, 'job-xyz');
  assert.throws(() => stateAsyncJobIdParamSchema.parse({ jobId: '' }));
});

test('stateCommandSchema mantém compatibilidade com SALE_DRAFT_CONFIRM_PAID', () => {
  const parsed = stateCommandSchema.parse({
    type: 'SALE_DRAFT_CONFIRM_PAID',
    draftId: 'draft-abc',
    commandId: 'cmd-abc',
  });

  assert.equal(parsed.type, 'SALE_DRAFT_CONFIRM_PAID');
  assert.equal(parsed.draftId, 'draft-abc');
  assert.equal(parsed.commandId, 'cmd-abc');
});
