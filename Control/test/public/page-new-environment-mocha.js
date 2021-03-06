/* eslint-disable max-len */
const assert = require('assert');
const test = require('../mocha-index');

let url;
let page;
let calls;

describe('`pageNewEnvironment` test-suite', async () => {
  before(() => {
    url = test.helpers.url;
    page = test.page;
    calls = test.helpers.calls;
  });

  beforeEach(() => {
    // reset grpc calls
    calls['getWorkflowTemplates'] = undefined;
    calls['listRepos'] = undefined;
    calls['getEnvironments'] = undefined;
    calls['getEnvironment'] = undefined;
    calls['newEnvironment'] = undefined;
  });

  it('should successfully load newEnvironment page and needed resources', async () => {
    await page.goto(url + '?page=newEnvironment', {waitUntil: 'networkidle0'});
    const location = await page.evaluate(() => window.location);
    assert(location.search === '?page=newEnvironment');
    assert.ok(calls['getWorkflowTemplates']);
    assert.ok(calls['listRepos']);
  });

  it('should successfully request and parse a list of template objects', async () => {
    const templatesMap = await page.evaluate(() => {
      return window.model.workflow.templatesMap;
    });
    const expectedMap = {
      kind: 'Success', payload:
        {'git.cern.ch/some-user/some-repo/': {master: ['prettyreadout-1']}}
    };
    assert.deepStrictEqual(templatesMap, expectedMap);
  });

  it('should successfully request and parse a list of repositories objects', async () => {
    const repositories = await page.evaluate(() => {
      return window.model.workflow.repoList;
    });
    const expectedRepositories = {
      kind: 'Success',
      payload: {
        repos: [
          {name: 'git.cern.ch/some-user/some-repo/', default: true},
          {name: 'git.com/alice-user/alice-repo/'}
        ]
      }
    };
    assert.deepStrictEqual(repositories, expectedRepositories);
  });

  it('should have `Create` button disabled due to no selected workflow', async () => {
    const button = await page.evaluate(() => {
      const button = document.querySelector(
        'body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(3) > button');
      return {title: button.title, classList: button.classList, disabled: button.disabled};
    });
    assert.strictEqual(button.title, 'Create');
    assert.ok(button.disabled);
    assert.deepStrictEqual(button.classList, {0: 'btn', 1: 'btn-primary'});
  });

  it('should successfully select a workflow from template list', async () => {
    await page.evaluate(() => document.querySelector('body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(2) > div > a').click());
    await page.waitFor(200);
    const selectedWorkflow = await page.evaluate(() => {
      const element = document.querySelector('body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(2) > div > a');
      return {classList: element.classList};
    });

    assert.deepStrictEqual(selectedWorkflow.classList, {0: 'menu-item', 1: 'selected'});
  });

  it('should throw error when `Create` button is clicked due to `Control is not locked`', async () => {
    await page.evaluate(() => document.querySelector(
      'body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(3) > button').click());
    await page.waitFor(500);
    const errorOnCreation = await page.evaluate(() => window.model.environment.itemNew);
    assert.strictEqual(errorOnCreation.kind, 'Failure');
    assert.strictEqual(errorOnCreation.payload, 'Request to server failed (403 Forbidden): Control is not locked');
  });

  it('should display error message due to `Control is not locked`', async () => {
    const errorMessage = await page.evaluate(() => {
      const errorElement = document.querySelector(
        'body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(3) > p');
      return {text: errorElement.innerText, classList: errorElement.classList};
    });
    assert.strictEqual(errorMessage.text, ' Request to server failed (403 Forbidden): Control is not locked');
    assert.deepStrictEqual(errorMessage.classList, {0: 'text-center', 1: 'danger'});
  });

  it('should successfully display `Refresh repositories` button', async () => {
    await page.waitForSelector('body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div > div > button', {timeout: 5000});
    const refreshRepositoriesButtonTitle = await page.evaluate(() => document.querySelector(
      'body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div > div > button').title);
    assert.deepStrictEqual(refreshRepositoriesButtonTitle, 'Refresh repositories');
  });

  it('should click to refresh repositories but throw error due to `Control is not locked`', async () => {
    await page.waitForSelector('body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div > div > button', {timeout: 5000});
    await page.evaluate(() => document.querySelector(
      'body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div > div > button').click());
    await page.waitFor(500);
    const errorOnRefresh = await page.evaluate(() => window.model.workflow.refreshedRepositories);
    assert.deepStrictEqual(calls['refreshRepos'], undefined);
    assert.deepStrictEqual(errorOnRefresh, {kind: 'Failure', payload: 'Request to server failed (403 Forbidden): Control is not locked'});
  });

  it('should successfully select second repository from dropdown', async () => {
    const selectedRepository = await page.select('select', 'git.com/alice-user/alice-repo/');
    await page.waitFor(500);
    assert.deepStrictEqual(selectedRepository, ['git.com/alice-user/alice-repo/']);
  });

  it('should have error of missing revisions for this repository', async () => {
    const errorMessage = await page.evaluate(() => {
      const errorElement = document.querySelector(
        'body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > p');
      return {classList: errorElement.classList, text: errorElement.innerText};
    });

    assert.strictEqual(errorMessage.text.trim(), 'No revisions found for this repository. Please contact an administrator');
    assert.deepStrictEqual(errorMessage.classList, {0: 'text-center', 1: 'danger'});
  });

  it('should successfully request LOCK', async () => {
    await page.waitForSelector('body > div:nth-child(2) > div > div > button', {timeout: 5000});
    await page.evaluate(() => document.querySelector('body > div:nth-child(2) > div > div > button').click());
    await page.waitFor(500);
    const lockButton = await page.evaluate(() => document.querySelector('body > div:nth-child(2) > div > div > button').title);
    assert.deepStrictEqual(lockButton, 'Lock is taken by Anonymous (id 0)');
  });

  it('should successfully request refresh of repositories and NOT request repositories again due to refresh action failing', async () => {
    await page.waitForSelector('body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div > div > button', {timeout: 5000});
    await page.evaluate(() => document.querySelector(
      'body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div > div > button').click());
    await page.waitFor(500);
    const errorOnRefresh = await page.evaluate(() => window.model.workflow.refreshedRepositories);
    assert.ok(calls['refreshRepos']);
    assert.deepStrictEqual(errorOnRefresh, {kind: 'Failure', payload: 'Request to server failed (504 Gateway Timeout): 2 UNKNOWN: 504: Unable to refresh repositories'});
    assert.deepStrictEqual(calls['listRepos'], undefined);
  });

  it('should successfully request refresh of repositories and request repositories list, its contents and branches again', async () => {
    await page.waitForSelector('body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div > div > button', {timeout: 5000});
    await page.evaluate(() => document.querySelector(
      'body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div > div > button').click());
    await page.waitFor(1000);
    assert.ok(calls['refreshRepos']);
    assert.ok(calls['getWorkflowTemplates']);
    assert.ok(calls['listRepos']);
  });

  it('should successfully select a workflow from template list', async () => {
    await page.evaluate(() => document.querySelector('body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(2) > div > a').click());
    await page.waitFor(200);
    const selectedWorkflow = await page.evaluate(() => {
      const element = document.querySelector('body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(2) > div > a');
      return {classList: element.classList};
    });
    assert.deepStrictEqual(selectedWorkflow.classList, {0: 'menu-item', 1: 'selected'});
  });

  it('should successfully create a new environment', async () => {
    await page.evaluate(() => document.querySelector(
      'body > div:nth-child(2) > div:nth-child(2) > div:nth-child(2) > div > div > div:nth-child(2) > div:nth-child(3) > button').click());
    await page.waitFor(1000);
    const location = await page.evaluate(() => window.location);

    assert.strictEqual(location.search, '?page=environment&id=6f6d6387-6577-11e8-993a-f07959157220');
    assert.ok(calls['newEnvironment']);
    assert.ok(calls['getEnvironment']);
  });

  it('should successfully release LOCK', async () => {
    await page.waitForSelector('body > div:nth-child(2) > div > div > button', {timeout: 5000});
    await page.evaluate(() => document.querySelector('body > div:nth-child(2) > div > div > button').click());
    await page.waitFor(500);
    const lockButton = await page.evaluate(() => document.querySelector('body > div:nth-child(2) > div > div > button').title);
    assert.deepStrictEqual(lockButton, 'Lock is free');
  });
});
