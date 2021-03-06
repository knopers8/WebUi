import {h} from '/js/src/index.js';

/**
 * Bottom bar, showing status of the log's list and its details,
 * some application messages and some basic options like auto-scroll checkbox.
 * @param {Object} model
 * @return {vnode}
 */
export default (model) => [
  h('.flex-row', [
    h('', {style: 'width:40%'}, statusLogs(model)),
    h('.w-50', {style: 'text-align: center;'}, sqlQuery(model)),
    h('.flex-grow.text-right', applicationMessage(model), applicationOptions(model)),
  ]),
];

/**
 * Show information about the logs seen by user:
 * - source (query or live)
 * - how many are loaded, how many in database
 * - timing, hostname, stats, etc.
 * @param {object} model
 * @return {vnode}
 */
const statusLogs = (model) => model.servicesResult.match({
  NotAsked: () => 'Loading services...',
  Loading: () => 'Loading services...',
  Success: (services) => [
    statusStats(model),
    model.log.isLiveModeRunning() && statusLive(model, services),
  ],
  Failure: () => h('span.danger', 'Unable to load services'),
});

/**
 * Component displaying the SQL query built with the user's filters
 * @param {Object} model
 * @return {vnode}
 */
const sqlQuery = (model) => model.log.queryResult.match({
  NotAsked: () => null,
  Loading: () => null,
  Success: (data) => h('.dropup.w-100', {
    class: model.log.statusDropdown ? 'dropup-open' : '',
  }, [
    h('.query-item.w-wrapped.ph1', {
      title: 'Toggle to view full SQL query',
      style: 'min-width: 0%;',
      onclick: () => model.log.toggleStatusDropdown()
    }, data.queryAsString),
    h('.dropup-menu.p2.gray-darker.text-center.w-100', [
      h('', {style: 'font-weight: bold'}, 'SQL QUERY'), data.queryAsString])]),
  Failure: () => null,
});


/**
 * Application message, could be deprecated when notification is implemented
 * @param {Object} model
 * @return {vnode}
 */
const applicationMessage = (model) => model.log.list.length > model.log.applicationLimit
  ? h('span.danger', `Application reached more than ${model.log.applicationLimit} logs, please clear if possible `)
  : null;

/**
 * Show some application preferences: auto-scroll and inspector checkboxes
 * (could be evolve into a preference panel in the future if more options are added)
 * @param {Object} model
 * @return {vnode}
 */
const applicationOptions = (model) => [
  h('label.d-inline', {title: 'Scroll down in live mode on new log incoming'}, h('input', {
    type: 'checkbox',
    checked: model.log.autoScrollLive,
    onchange: () => model.log.toggleAutoScroll()
  }), ' Autoscroll'),
  h('span.mh1'),
  h('label.d-inline', {title: 'Show details of selected log'}, h('input', {
    type: 'checkbox',
    checked: model.inspectorEnabled,
    onchange: () => model.toggleInspector()
  }), ' Inspector'),
];

/**
 * Status for query mode, showing how many logs are really in DB and how much time it took to load it
 * @param {Object} model
 * @param {Object} result - raw query result from server with its meta data
 * @return {vnode}
 */
const statusQuery = (model, result) => `\
(loaded out of ${result.total}${result.more ? '+' : ''} \
in ${(result.time / 1000).toFixed(2)} second(s)${(result.time / 1000) >= 2 ? 's' : ''})\
`;

/**
 * Status of live mode with hostname of streaming source and date it started
 * @param {Object} model
 * @param {Object} services - service discovery information of what is enabled in this ILG instance
 * @return {vnode}
 */
const statusLive = (model, services) => [
  `(Connected to ${services.streamHostname} for ${model.timezone.formatDuration(model.log.liveStartedAt)})`
];

/**
 * Status of the log's list (independant of mode): how many global and how many per severity
 * @param {Object} model
 * @return {vnode}
 */
const statusStats = (model) => [
  h('span.ph1', `${model.log.list.length} message${model.log.list.length >= 2 ? 's' : ''}`),
  model.log.queryResult.match({
    NotAsked: () => null,
    Loading: () => 'Querying server...',
    Success: (result) => statusQuery(model, result),
    Failure: () => null, // notification
  }),
  h('span.ph1.severity-d', `${model.log.stats.debug} debug`),
  h('span.ph1.severity-i', `${model.log.stats.info} info`),
  h('span.ph1.severity-w', `${model.log.stats.warning} warn`),
  h('span.ph1.severity-e', `${model.log.stats.error} error`),
  h('span.ph1.severity-f', `${model.log.stats.fatal} fatal`)
];
