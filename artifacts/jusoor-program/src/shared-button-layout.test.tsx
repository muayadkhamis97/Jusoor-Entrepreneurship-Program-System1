import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { tokens } from '@workspace/program-editorial/tokens';

// tsx's preserve-mode runner needs the same classic JSX bridge as other SSR tests.
const originalReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
after(() => {
  if (originalReact) Object.defineProperty(globalThis, 'React', originalReact);
  else Reflect.deleteProperty(globalThis, 'React');
});

test('shared buttons keep the icon and label as direct flex children', () => {
  const markup = renderToStaticMarkup(createElement(
    Button,
    { variant: 'secondary', size: 'sm' },
    createElement('svg', { 'aria-hidden': true }),
    'Resend invitation',
  ));
  assert.match(markup, /inline-flex/);
  assert.match(markup, /items-center/);
  assert.match(markup, /whitespace-nowrap/);
  assert.match(markup, /<svg[^>]*><\/svg>Resend invitation/);
  assert.doesNotMatch(markup, /<span[^>]*><svg/);
});

test('shared actions retain native semantics and accent or destructive styling', () => {
  const primary = renderToStaticMarkup(createElement(Button, { disabled: true }, 'Saving…'));
  assert.match(primary, /type="button"/);
  assert.match(primary, /disabled=""/);
  assert.match(primary, /bg-accent text-accent-foreground/);
  const danger = renderToStaticMarkup(createElement(Button, { variant: 'danger', size: 'sm' }, 'Revoke'));
  assert.match(danger, /text-destructive/);
  assert.match(danger, /h-8/);
});

test('link actions use the shared styling without nesting a button', () => {
  const markup = renderToStaticMarkup(createElement(
    Button, { asChild: true, variant: 'secondary', arrow: true },
    createElement('a', { href: '/programs' }, 'Programs'),
  ));
  assert.match(markup, /^<a /);
  assert.match(markup, /href="\/programs"/);
  assert.match(markup, /Programs<span aria-hidden="true"/);
  assert.doesNotMatch(markup, /<button|type="button"/);
});

test('requested neutral surfaces remain defined in the shared theme', () => {
  assert.equal(tokens.color.light.background.toUpperCase(), '#F8F7FA');
  assert.equal(tokens.color.light.card.toUpperCase(), '#FFFFFF');
  assert.equal(tokens.color.light.border.toUpperCase(), '#E8E2ED');
});
