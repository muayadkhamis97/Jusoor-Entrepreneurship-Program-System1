import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { translate } from './language';

test('engagement list delegates feedback ownership to keyed card components', () => {
  const parent = readFileSync(new URL('./role-surfaces.tsx', import.meta.url), 'utf8');
  const component = readFileSync(new URL('./mentor-engagement-card.tsx', import.meta.url), 'utf8');
  assert.match(parent, /<MentorEngagementCard item=\{item\}/);
  assert.match(parent, /className="mentor-session-progress"/);
  assert.match(parent, /additionalSessionRequestPendingIds\.has\(item\.id\)/);
  assert.match(parent, /additionalSessionRequestErrorIds\.has\(item\.id\)/);
  assert.match(parent, /resolvingAdditionalSessionRequestIds\.has\(request\.id\)/);
  assert.match(parent, /additionalSessionRequestResolveErrorIds\.has\(request\.id\)/);
  assert.match(parent, /resolveRequest\('approved'\)/);
  assert.match(parent, /resolveRequest\('declined'\)/);
  assert.match(parent, /request\.canRetryEmail/);
  assert.match(parent, /Retry email notification/);
  assert.doesNotMatch(parent, /useUpdateAssignedMentoring/);
  assert.match(component, /const update = useUpdateAssignedMentoring\(\)/);
  assert.match(component, /update.mutate\(\{ id: item.id, data \}/);
  assert.match(component, /if \(submitting.current\) return/);
  assert.match(component, /onSettled: \(\) => \{ submitting.current = false/);
  assert.match(component, /update.reset\(\)/);
  assert.match(component, /role="alert"/);
  assert.match(component, /role="status"/);
  assert.match(component, /invalidateQueries\(\{ queryKey: getGetMentorDashboardQueryKey\(\)/);
});

test('engagement success feedback has an Arabic translation', () => {
  assert.notEqual(translate('Engagement saved.', 'ar'), 'Engagement saved.');
});
