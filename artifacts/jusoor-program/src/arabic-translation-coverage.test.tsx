import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as ts from 'typescript';
import { brandedAdminRoleLabel, hasArabicTranslation, translate } from './language';
import { getStaffNavigationItems } from './mobile-staff-navigation';

const sourceRoot = path.resolve(import.meta.dirname);
const intentionallyEnglishExamples = new Set([
  'https://…',
  'https://drive.google.com/file/d/…/view',
  'Jusoor',
  'J',
  'ZOOM_CLIENT_ID',
  'ZOOM_CLIENT_SECRET',
  'meeting:write:meeting',
  'recording.completed',
]);

function addStaticTranslationArgument(node: ts.Node, keys: Set<string>) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    keys.add(node.text);
    return;
  }

  if (ts.isConditionalExpression(node)) {
    addStaticTranslationArgument(node.whenTrue, keys);
    addStaticTranslationArgument(node.whenFalse, keys);
    return;
  }

  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  ) {
    addStaticTranslationArgument(node.left, keys);
    addStaticTranslationArgument(node.right, keys);
  }
}

function addNamedObjectValues(source: ts.SourceFile, name: string, keys: Set<string>) {
  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      for (const property of node.initializer.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          (ts.isStringLiteral(property.initializer) ||
            ts.isNoSubstitutionTemplateLiteral(property.initializer))
        ) {
          keys.add(property.initializer.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function addObjectFieldTextValues(
  source: ts.SourceFile,
  name: string,
  fieldNames: readonly string[],
  keys: Set<string>,
) {
  function addStringLiterals(node: ts.Node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      keys.add(node.text);
    }
    ts.forEachChild(node, addStringLiterals);
  }

  function visit(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer
    ) {
      function visitProperties(value: ts.Node) {
        if (ts.isPropertyAssignment(value)) {
          const fieldName = value.name.getText(source).replace(/^['"]|['"]$/g, '');
          if (fieldNames.includes(fieldName)) addStringLiterals(value.initializer);
          else if (ts.isObjectLiteralExpression(value.initializer) || ts.isArrayLiteralExpression(value.initializer)) {
            visitProperties(value.initializer);
          }
        } else if (ts.isObjectLiteralExpression(value)) {
          value.properties.forEach(visitProperties);
        } else if (ts.isArrayLiteralExpression(value)) {
          value.elements.forEach(visitProperties);
        }
      }
      visitProperties(node.initializer);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function addComponentPropStrings(
  source: ts.SourceFile,
  componentName: string,
  propNames: readonly string[],
  keys: Set<string>,
) {
  function visit(node: ts.Node) {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === componentName
    ) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !propNames.includes(attribute.name.getText(source))) continue;
        if (!attribute.initializer) continue;
        if (ts.isStringLiteral(attribute.initializer)) keys.add(attribute.initializer.text);
        else if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
          addStaticTranslationArgument(attribute.initializer.expression, keys);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function collectFlowTranslationKeys(fileName: string, keys: Set<string>) {
  const text = readFileSync(path.join(sourceRoot, fileName), 'utf8');
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fieldStart = fileName === 'App.tsx' ? text.indexOf('const programFields: Field[] = [') : -1;
  const fieldEnd = fieldStart >= 0 ? text.indexOf('const valueOf =', fieldStart) : -1;

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 't' &&
      node.arguments.length === 1
    ) {
      addStaticTranslationArgument(node.arguments[0], keys);
    }

    if (
      fileName === 'App.tsx' &&
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === 'FormDialog'
    ) {
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          ['title', 'description', 'error'].includes(attribute.name.getText(source)) &&
          attribute.initializer
        ) {
          if (ts.isStringLiteral(attribute.initializer)) {
            keys.add(attribute.initializer.text);
          } else if (
            ts.isJsxExpression(attribute.initializer) &&
            attribute.initializer.expression
          ) {
            addStaticTranslationArgument(attribute.initializer.expression, keys);
          }
        }
      }
    }

    if (
      fileName === 'profile-surfaces.tsx' &&
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === 'ProfileForm'
    ) {
      for (const attribute of node.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          ['pageTitle', 'pageDescription'].includes(attribute.name.getText(source)) &&
          attribute.initializer
        ) {
          if (ts.isStringLiteral(attribute.initializer)) {
            keys.add(attribute.initializer.text);
          } else if (
            ts.isJsxExpression(attribute.initializer) &&
            attribute.initializer.expression
          ) {
            addStaticTranslationArgument(attribute.initializer.expression, keys);
          }
        }
      }
    }

    if (
      fileName === 'App.tsx' &&
      fieldStart >= 0 &&
      node.pos >= fieldStart &&
      node.end <= fieldEnd &&
      ts.isPropertyAssignment(node) &&
      ['label', 'placeholder', 'hint'].includes(node.name.getText(source)) &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      keys.add(node.initializer.text);
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'map' &&
      ts.isArrayLiteralExpression(node.expression.expression) &&
      node.arguments[0]?.getText(source).includes('display(')
    ) {
      for (const element of node.expression.expression.elements) {
        if (ts.isStringLiteral(element)) {
          keys.add(element.text.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()));
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  addNamedObjectValues(source, 'stageNames', keys);
  addNamedObjectValues(source, 'statusWords', keys);

  if (fileName === 'role-access.tsx') {
    addObjectFieldTextValues(source, 'roles', ['title', 'kind', 'summary'], keys);
    addObjectFieldTextValues(source, 'matrix', ['area', 'detail'], keys);
    addObjectFieldTextValues(source, 'previewData', ['headline', 'note', 'items', 'actions'], keys);
  }

  if (fileName === 'App.tsx') {
    addComponentPropStrings(source, 'PageHeading', ['kicker', 'title', 'summary'], keys);
    addComponentPropStrings(source, 'EmptyState', ['title', 'body'], keys);
    for (const key of [
      'Food & agriculture',
      'Circular economy',
      'Health technology',
      'Climate & retail',
    ]) keys.add(key);
    const titleStart = text.indexOf('const stageNames:');
    const titleEnd = text.indexOf('\n};', titleStart);
    if (titleStart >= 0 && titleEnd > titleStart) {
      const stageText = text.slice(titleStart, titleEnd);
      const stageSource = ts.createSourceFile('stage-names.ts', stageText, ts.ScriptTarget.Latest, true);
      addNamedObjectValues(stageSource, 'stageNames', keys);
    }
  }

  if (fileName === 'intake-surfaces.tsx') {
    for (const key of ['Bootcamp', 'Hackathon']) keys.add(key);
    const schemaStart = text.indexOf('const applicationSchema');
    const schemaEnd = text.indexOf('type ApplicationFormValues', schemaStart);
    if (schemaStart >= 0 && schemaEnd > schemaStart) {
      const schemaSource = ts.createSourceFile(
        'application-schema.ts',
        text.slice(schemaStart, schemaEnd),
        ts.ScriptTarget.Latest,
        true,
      );
      function addValidationMessages(node: ts.Node) {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
          keys.add(node.text);
        }
        ts.forEachChild(node, addValidationMessages);
      }
      addValidationMessages(schemaSource);
    }
  }
}

function collectRawJsxText(fileName: string): string[] {
  const text = readFileSync(path.join(sourceRoot, fileName), 'utf8');
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const raw: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      const value = node.text.replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]/.test(value) && !intentionallyEnglishExamples.has(value)) raw.push(value);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return raw;
}

function collectRawJsxTextInFunctions(fileName: string, functionNames: readonly string[]): string[] {
  const text = readFileSync(path.join(sourceRoot, fileName), 'utf8');
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const raw: string[] = [];
  function scanFunction(node: ts.Node, name: string) {
    if (ts.isJsxText(node)) {
      const value = node.text.replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]/.test(value) && !intentionallyEnglishExamples.has(value)) raw.push(`${name}: ${value}`);
    }
    ts.forEachChild(node, child => scanFunction(child, name));
  }
  function visit(node: ts.Node) {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      functionNames.includes(node.name.text)
    ) {
      scanFunction(node, node.name.text);
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return raw;
}

test('applicant, coordinator, and profile flow strings have Arabic translations', () => {
  const keys = new Set<string>();
  collectFlowTranslationKeys('intake-surfaces.tsx', keys);
  collectFlowTranslationKeys('App.tsx', keys);
  collectFlowTranslationKeys('profile-surfaces.tsx', keys);
  collectFlowTranslationKeys('role-surfaces.tsx', keys);
  collectFlowTranslationKeys('analytics-surfaces.tsx', keys);
  collectFlowTranslationKeys('session-interactions.tsx', keys);
  collectFlowTranslationKeys('role-access.tsx', keys);
  collectFlowTranslationKeys('api-integrations.tsx', keys);
  collectFlowTranslationKeys('grant-surfaces.tsx', keys);
  collectFlowTranslationKeys('communications-surfaces.tsx', keys);
  for (const role of ['coordinator', 'staff'] as const) {
    getStaffNavigationItems(role).forEach(item => keys.add(item.label));
  }
  [
    'Invite participant',
    'Participant email',
    'Participant name (optional)',
    'Program and business',
    'Participant invitations',
    'Program and existing business access',
    'No participant invitations yet.',
    'Could not load participant invitations.',
    'PARTICIPANT ACCESS',
    'EMAIL',
    'PARTICIPANT',
    'PROGRAM / BUSINESS',
    'ACCOUNT',
    'ADDED',
    'Joined',
    'Waiting for sign-in',
    'Invite a participant',
    'Grant access to the selected program and existing business. The participant must sign in with this email; this action does not send email.',
    'The participant invitation could not be saved.',
    'This email already has an application or invitation for this program.',
    'Choose a business in an active program.',
    'Participant access assigned',
    'No program access linked yet.',
    'Check that you’re signed in with the same verified email used on your application or invitation. Your records remain private.',
    'This account does not have a program application or invitation associated with it. Sign in using the same verified email you used when applying or the email Admin invited, or start an application to a current cohort.',
    'Every role is tied to a verified email.',
    'Choose admin, program staff, trainer, mentor or judge access. Members sign up using the same verified email address. This approval does not send an email automatically.',
    'Participant invitations require the additive participant invitation migration.',
    'Participant business-team assignments require the assignment migration.',
    'All pages',
    'Open all pages menu',
    'Your question',
    'Your answer',
    'We could not load your business team.',
    'An application for this email and program already exists. Sign in with that email to track it, or contact the program team.',
    'Could not create a Zoom meeting.',
    'Could not disconnect Zoom.',
    'Could not start Zoom authorization.',
    'Trainers and participants can now use its session link.',
    'Zoom authorization is complete.',
    'Zoom authorization was cancelled.',
    'Zoom could not be connected. Check the Zoom app settings and try again.',
    'Zoom meeting saved for',
    'Zoom was disconnected. Existing session links and recordings remain available.',
  ].forEach(key => keys.add(key));
  const missing = [...keys]
    .filter(key => !hasArabicTranslation(key) && !intentionallyEnglishExamples.has(key))
    .sort();

  assert.deepEqual(missing, [], `Add Arabic translations for: ${missing.join(', ')}`);
});

test('fixed copy in role-access and communication screens is translated; dynamic text stays out of the scan', () => {
  const untranslated = ['role-access.tsx', 'communications-surfaces.tsx']
    .flatMap(file => collectRawJsxText(file).map(text => `${file}: ${text}`));
  untranslated.push(
    ...collectRawJsxTextInFunctions('intake-surfaces.tsx', ['EnrollmentCard', 'ParticipantLearning']),
    ...collectRawJsxTextInFunctions('role-surfaces.tsx', ['TrainerDashboardPage', 'RoleNotFound']),
    ...collectRawJsxTextInFunctions('App.tsx', ['SessionsPage', 'SupportPage', 'PitchesPage']),
  );
  assert.deepEqual(untranslated, [], `Wrap fixed UI copy in t(): ${untranslated.join(' | ')}`);

  const participantProvidedAnswer = 'I need help choosing my market';
  assert.equal(translate(participantProvidedAnswer, 'ar'), participantProvidedAnswer);
  assert.equal(hasArabicTranslation(participantProvidedAnswer), false);
});

test('Arabic translation and English fallback preserve dynamic and example content', () => {
  assert.equal(translate('Choose your cohort', 'ar'), 'اختر المجموعة');
  assert.equal(translate('Choose your cohort', 'en'), 'Choose your cohort');

  const staffProvidedCohortDescription = 'A custom cohort description entered by program staff';
  assert.equal(translate(staffProvidedCohortDescription, 'ar'), staffProvidedCohortDescription);
  assert.equal(hasArabicTranslation(staffProvidedCohortDescription), false);
  assert.equal(translate('https://drive.google.com/file/d/…/view', 'ar'), 'https://drive.google.com/file/d/…/view');
});

test('Admin sidebar role label follows the configured brand in English and Arabic', () => {
  assert.equal(brandedAdminRoleLabel('Jusoor Growth', 'en'), 'Jusoor Growth admin');
  assert.equal(brandedAdminRoleLabel('Jusoor Growth', 'ar'), 'مسؤول Jusoor Growth');
  assert.equal(brandedAdminRoleLabel('  ', 'en'), 'Jusoor admin');
});

test('Admin page breadcrumb uses the configured brand name instead of a static label', () => {
  const appSource = readFileSync(path.join(sourceRoot, 'App.tsx'), 'utf8');
  assert.match(appSource, /const brandName = branding\?\.brandName \|\| 'Jusoor'/);
  assert.match(appSource, /data-testid="breadcrumb-brand-name">\{brandName\}/);
  assert.doesNotMatch(appSource, /<span>JUSOOR<\/span>/);
});
