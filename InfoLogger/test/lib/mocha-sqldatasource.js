const assert = require('assert');
const sinon = require('sinon');
const config = require('../../config-default.js');
const SQLDataSource = require('../../lib/SQLDataSource.js');
const {MySQL} = require('@aliceo2/web-ui');


describe('SQLDataSource', () => {
  const filters = {
    timestamp: {
      since: -5,
      until: -1,
      $since: '2019-07-22T11:23:21.351Z',
      $until: '2019-07-22T11:24:21.354Z'
    },
    hostname: {
      match: 'test',
      exclude: 'testEx',
      $match: 'test',
      $exclude: 'testEx',
    },
    severity: {
      in: 'D I',
      $in: ['D', 'W'],
    },
    level: {
      max: 21, // 0, 1, 6, 11, 21
      $max: 21, // 0, 1, 6, 11, 21
    },
    pid: {
      $maxWrong: 22
    },
    userId: {
      min: 10,
      $min: 10
    }
  };

  const realFilters = {
    timestamp: {
      since: -5,
      until: -1,
      $since: '2019-07-22T11:23:21.351Z',
      $until: '2019-07-22T11:24:21.354Z'
    },
    hostname: {
      match: 'test',
      exclude: 'testEx',
      $match: 'test',
      $exclude: 'testEx',
    },
    severity: {
      in: 'D I',
      $in: ['D', 'W'],
    },
    level: {
      max: null, // 0, 1, 6, 11, 21
      $max: null, // 0, 1, 6, 11, 21
    }
  };
  const emptySqlDataSource = new SQLDataSource(undefined, {});

  describe('Should check connection to mysql driver', () => {
    it('should throw error when checking connection with mysql driver and driver returns rejected Promise', async () => {
      const stub = sinon.createStubInstance(MySQL,
        {
          query: sinon.stub().rejects(new Error('Unable to connect'))
        }
      );
      const sqlDataSource = new SQLDataSource(stub, config.mysql);

      await assert.rejects(async () => {
        await sqlDataSource.isConnectionUpAndRunning();
      }, new Error('Unable to connect'));
    });
    it('should do nothing when checking connection with mysql driver and driver returns resolved Promise', async () => {
      const stub = sinon.createStubInstance(MySQL,
        {
          query: sinon.stub().resolves('Connection is fine')
        }
      );
      const sqlDataSource = new SQLDataSource(stub, config.mysql);

      await assert.doesNotReject(async () => {
        await sqlDataSource.isConnectionUpAndRunning();
      });
    });
  });

  describe('Filter to SQL Conditions', () => {
    it('should successfully return empty values & criteria when translating empty filters from client', () => {
      assert.deepStrictEqual(emptySqlDataSource._filtersToSqlConditions({}), {values: [], criteria: [], criteriaVerbose: []});
    });

    it('should successfully return values & criteria when translating filters from client', () => {
      const expectedValues = [1563794601.351, 1563794661.354, 'test', 'testEx', ['D', 'W'], 21, 22, 10];
      const expectedCriteria = ['`timestamp`>=?', '`timestamp`<=?',
        '`hostname` LIKE (?)', '(NOT(`hostname` LIKE (?)) OR `hostname` IS NULL)',
        '`severity` IN (?)', '`level`<=?', '`userId`>=?'];
      const expectedVerbose = [' `timestamp`>=\'-5\'',
        ' `timestamp`<=\'-1\'',
        ' `hostname` LIKE \'test\'',
        ' (NOT(`hostname` LIKE \'testEx\' OR `undefined` IS NULL)',
        ' `severity` IN [D,W]',
        ' `level`<=\'undefined\'',
        ' `userId`>=\'undefined\''];
      assert.deepStrictEqual(emptySqlDataSource._filtersToSqlConditions(filters),
        {values: expectedValues, criteria: expectedCriteria, criteriaVerbose: expectedVerbose});
    });
  });

  describe('Parse criteria as SQL Query', () => {
    it('should successfully return empty string for criteria if array is empty', () => {
      assert.deepStrictEqual(emptySqlDataSource._getCriteriaAsString([]), '');
    });

    it('should successfully return empty string for criteria if array is undefined', () => {
      assert.deepStrictEqual(emptySqlDataSource._getCriteriaAsString(undefined), '');
    });

    it('should successfully return empty string for criteria if array is null', () => {
      assert.deepStrictEqual(emptySqlDataSource._getCriteriaAsString(null), '');
    });

    it('should successfully return SQL format criteria if array contains values', () => {
      const criteria = ['`timestamp`>=?', '`timestamp`<=?',
        '`hostname` LIKE (?)', '(NOT(`hostname` LIKE (?)) OR `hostname` IS NULL)',
        '`severity` IN (?)'];
      const expectedCriteriaString = 'WHERE `timestamp`>=? AND `timestamp`<=? AND ' +
        '`hostname` LIKE (?) AND (NOT(`hostname` LIKE (?)) OR `hostname` IS NULL) AND `severity` IN (?)';
      assert.deepStrictEqual(emptySqlDataSource._getCriteriaAsString(criteria), expectedCriteriaString);
    });
  });

  it('should successfully return number of results when querying mysql driver for counter of messages', async () => {
    const stub = sinon.createStubInstance(MySQL, {query: sinon.stub().resolves(10)});
    const sqlDataSource = new SQLDataSource(stub, config.mysql);
    const queryResult = await sqlDataSource._countMessagesOnOptions('criteriaString', []);
    assert.deepStrictEqual(queryResult, 10);
  });

  it('should successfully return `-1` when querying mysql driver for counter of messages results in rejected promise', async () => {
    const stub = sinon.createStubInstance(MySQL, {query: sinon.stub().rejects()});
    const sqlDataSource = new SQLDataSource(stub, config.mysql);
    const queryResult = await sqlDataSource._countMessagesOnOptions('criteriaString', []);
    assert.deepStrictEqual(queryResult, [{total: -1}]);
  });

  it('should successfully return messages when querying mysql driver', async () => {
    const stub = sinon.createStubInstance(MySQL, {query: sinon.stub().resolves([{severity: 'W'}, {severity: 'I'}])});
    const sqlDataSource = new SQLDataSource(stub, config.mysql);
    const queryResult = await sqlDataSource._queryMessagesOnOptions('criteriaString', []);
    assert.deepStrictEqual(queryResult, [{severity: 'W'}, {severity: 'I'}]);
  });

  it('should throw an error when unable to query within private method due to rejected promise', async () => {
    const stub = sinon.createStubInstance(MySQL, {query: sinon.stub().rejects()});
    const sqlDataSource = new SQLDataSource(stub, config.mysql);
    return assert.rejects(async () => {
      await sqlDataSource._queryMessagesOnOptions('criteriaString', []);
    }, new Error('Error'));
  });

  it('should throw an error when unable to query(API) due to rejected promise', async () => {
    const stub = sinon.createStubInstance(MySQL, {query: sinon.stub().rejects()});
    const sqlDataSource = new SQLDataSource(stub, config.mysql);
    return assert.rejects(async () => {
      await sqlDataSource.queryFromFilters(realFilters, {limit: 10});
    }, new Error('Error'));
  });

  it('should throw an error if no filters are provided for querying', async () => {
    await assert.rejects(async () => {
      await emptySqlDataSource.queryFromFilters(undefined, undefined);
    }, new Error('filters parameter is mandatory'));
  });

  it('should successfully return result when filters are provided for querying', async () => {
    const criteriaString = 'WHERE `timestamp`>=? AND `timestamp`<=? AND ' +
      '`hostname` LIKE (?) AND (NOT(`hostname` LIKE (?)) OR `hostname` IS NULL) AND `severity` IN (?)';
    const requestRows = `SELECT * from (SELECT * FROM \`messages\` ${criteriaString} ORDER BY \`TIMESTAMP\` DESC LIMIT 10) as reordered ORDER BY \`TIMESTAMP\` ASC`;
    const requestCount = `SELECT COUNT(*) as total FROM (SELECT 1 FROM \`messages\` ${criteriaString} LIMIT 100001) t1`;
    const values = [1563794601.351, 1563794661.354, 'test', 'testEx', ['D', 'W']];
    const query = 'SELECT * FROM `messages` WHERE  `timestamp`>=\'-5\', `timestamp`<=\'-1\', `hostname` LIKE \'test\', (NOT(`hostname` LIKE \'testEx\' OR `undefined` IS NULL), `severity` IN [D,W] ORDER BY `TIMESTAMP` DESC LIMIT 10';
    const queryStub = sinon.stub();
    queryStub.withArgs(requestRows, values).resolves([]);
    queryStub.withArgs(requestCount, values).resolves([{total: 10}]);
    const stub = sinon.createStubInstance(MySQL, {query: queryStub});

    const sqlDataSource = new SQLDataSource(stub, config.mysql);
    const result = await sqlDataSource.queryFromFilters(realFilters, {limit: 10});

    const expectedResult = {
      rows: [],
      total: 10,
      count: 0,
      more: false,
      limit: 10,
      queryAsString: query
    };
    delete result.time;
    assert.deepStrictEqual(result, expectedResult);
  });

  it('should successfully limit the total of result when result is larger than 100k', async () => {
    const criteriaString = 'WHERE `timestamp`>=? AND `timestamp`<=? AND ' +
      '`hostname` LIKE (?) AND (NOT(`hostname` LIKE (?)) OR `hostname` IS NULL) AND `severity` IN (?)';
    const requestRows = `SELECT * from (SELECT * FROM \`messages\` ${criteriaString} ORDER BY \`TIMESTAMP\` DESC LIMIT 10) as reordered ORDER BY \`TIMESTAMP\` ASC`;
    const requestCount = `SELECT COUNT(*) as total FROM (SELECT 1 FROM \`messages\` ${criteriaString} LIMIT 100001) t1`;
    const values = [1563794601.351, 1563794661.354, 'test', 'testEx', ['D', 'W']];
    const query = 'SELECT * FROM `messages` WHERE  `timestamp`>=\'-5\', `timestamp`<=\'-1\', `hostname` LIKE \'test\', (NOT(`hostname` LIKE \'testEx\' OR `undefined` IS NULL), `severity` IN [D,W] ORDER BY `TIMESTAMP` DESC LIMIT 10';
    const queryStub = sinon.stub();
    queryStub.withArgs(requestRows, values).resolves([]);
    queryStub.withArgs(requestCount, values).resolves([{total: 200000}]);
    const stub = sinon.createStubInstance(MySQL, {query: queryStub});

    const sqlDataSource = new SQLDataSource(stub, config.mysql);
    const result = await sqlDataSource.queryFromFilters(realFilters, {limit: 10});

    const expectedResult = {
      rows: [],
      total: 100000,
      count: 0,
      more: true,
      limit: 10,
      queryAsString: query
    };
    delete result.time;
    assert.deepStrictEqual(result, expectedResult);
  });
});
