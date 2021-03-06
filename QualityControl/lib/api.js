const {Log, WebSocket} = require('@aliceo2/web-ui');
const config = require('./configProvider.js');
const projPackage = require('./../package.json');
const log = new Log('QualityControl');

// Load data source (demo or DB)
const model = config.demoData ? require('./QCModelDemo.js') : require('./QCModel.js');

/**
 * Adds paths and binds websocket to instance of HttpServer passed
 * @param {HttpServer} http
 */
module.exports.setup = (http) => {
  http.get('/readObjectData', readObjectData, {public: true});
  http.post('/readObjectsData', readObjectsData);
  http.get('/listObjects', listObjects, {public: true});
  http.get('/listOnlineObjects', listOnlineObjects);
  http.get('/isOnlineModeConnectionAlive', isOnlineModeConnectionAlive);
  http.post('/readLayout', readLayout);
  http.post('/writeLayout', updateLayout);
  http.post('/listLayouts', listLayouts);
  http.delete('/layout/:layoutId', deleteLayout);
  http.post('/layout', createLayout);
  http.get('/getFrameworkInfo', getFrameworkInfo);
  new WebSocket(http);
};

/**
 * List all objects without data
 * @param {Request} req
 * @param {Response} res
 */
function listObjects(req, res) {
  model.listObjects()
    .then((data) => res.status(200).json(data))
    .catch((err) => errorHandler(err, res));
}

/**
 * List all Online objects' name if online mode is enabled
 * @param {Request} req
 * @param {Response} res
 */
function listOnlineObjects(req, res) {
  if (typeof model.consulService !== 'undefined') {
    model.consulService.getServices()
      .then((services) => {
        const tags = getTagsFromServices(services);
        res.status(200).json(tags);
      })
      .catch((err) => errorHandler(err, res));
  } else {
    errorHandler('Online mode is not enabled due to missing Consul configuration', res, 503);
  }
}

/**
 * Check the state of OnlineMode by checking the status of Consul Leading Agent
 * @param {Request} req
 * @param {Response} res
 */
function isOnlineModeConnectionAlive(req, res) {
  if (typeof model.consulService !== 'undefined') {
    model.consulService.getConsulLeaderStatus()
      .then(() => res.status(200).json({running: true}))
      .catch((err) => errorHandler(`Unable to retrieve Consul Status: ${err}`, res));
  } else {
    errorHandler('Online mode is not enabled due to missing Consul configuration', res, 503);
  }
}

/**
 * List objects with data specified by objectName[]
 * Send back array of objects or {error: ...}
 * @param {Request} req
 * @param {Response} res
 */
function readObjectsData(req, res) {
  let objectsNames = req.body.objectsNames;

  if (!objectsNames) {
    res.status(400).send('parameter objectsNames is needed');
    return;
  }

  if (!Array.isArray(objectsNames)) {
    objectsNames = [objectsNames];
  }

  /**
   * Retrieves data or provides {error} object on failure
   * @param {Object} name - name path of object and its agent
   * @return {Promise.<Object>}
   */
  const safeRetriever = (name) => model.readObjectData(name)
    .then((data) => !data ? {error: 'Object not found'} : data)
    .catch((err) => ({error: err}));

  const promiseArray = objectsNames.map(safeRetriever);
  Promise.all(promiseArray)
    .then((results) => {
      const resultsByName = {};
      objectsNames.forEach((name, i) => {
        resultsByName[name] = results[i];
      });
      res.status(200).json(resultsByName);
    })
    .catch((err) => errorHandler(err, res));
}

/**
 * Read only data of an object specified by objectName
 * @param {Request} req
 * @param {Response} res
 */
function readObjectData(req, res) {
  const objectName = req.query.objectName;

  if (!objectName) {
    res.status(400).send('parameter objectName is needed');
    return;
  }

  model.readObjectData(objectName)
    .then((data) => res.status(data ? 200 : 404).json(data))
    .catch((err) => errorHandler('Reading object data: ' + err, res));
}

/**
 * List all layouts, can be filtered by owner_id
 * @param {Request} req
 * @param {Response} res
 */
function listLayouts(req, res) {
  const filter = {};
  if (req.body.owner_id !== undefined) {
    filter.owner_id = parseInt(req.body.owner_id, 10);
  }

  model.listLayouts(filter)
    .then((data) => res.status(200).json(data))
    .catch((err) => errorHandler(err, res));
}

/**
 * Read a single layout specified by layoutId
 * @param {Request} req
 * @param {Response} res
 */
function readLayout(req, res) {
  const layoutId = req.body.layoutId;

  if (!layoutId) {
    res.status(400).send('layoutId parameter is needed');
    return;
  }

  model.readLayout(layoutId)
    .then((data) => res.status(data ? 200 : 404).json(data))
    .catch((err) => errorHandler(err, res));
}

/**
 * Update a single layout specified by layoutId and body
 * @param {Request} req
 * @param {Response} res
 */
function updateLayout(req, res) {
  const layoutId = req.query.layoutId;
  const data = req.body;

  if (!layoutId) {
    res.status(400).send('layoutId parameter is needed');
    return;
  }

  if (!data) {
    res.status(400).send('body is needed');
    return;
  }

  model.updateLayout(layoutId, data)
    .then((data) => res.status(200).json(data))
    .catch((err) => errorHandler(err, res));
}

/**
 * Delete a single layout specified by layoutId
 * @param {Request} req
 * @param {Response} res
 */
function deleteLayout(req, res) {
  const layoutId = req.params.layoutId;

  if (!layoutId) {
    res.status(400).send('layoutId is needed');
    return;
  }

  model.deleteLayout(layoutId)
    .then((data) => res.status(204).json(data))
    .catch((err) => errorHandler(err, res));
}

/**
 * Create a layout specified by body
 * @param {Request} req
 * @param {Response} res
 */
function createLayout(req, res) {
  const layout = req.body;

  if (!layout.name) {
    res.status(400).send('layout.name parameter is needed');
    return;
  }
  if (layout.owner_id === undefined) { // integer from 0 to Infinity
    res.status(400).send('layout.owner_id parameter is needed');
    return;
  }
  if (!layout.owner_name) {
    res.status(400).send('layout.owner_name parameter is needed');
    return;
  }
  if (!layout.tabs) {
    res.status(400).send('layout.tabs parameter is needed');
    return;
  }

  model.createLayout(layout)
    .then((data) => res.status(201).json(data))
    .catch((err) => errorHandler(err, res, 409));
}

/**
 * Send back info about the framework
 * @param {Request} req
 * @param {Response} res
 */
function getFrameworkInfo(req, res) {
  if (!config) {
    errorHandler('Unable to retrieve configuration of the framework', res, 502);
  } else {
    const result = {};
    result.qcg = {};

    if (projPackage && projPackage.version) {
      result.qcg.version = projPackage.version;
    }
    if (config.http) {
      const qc = {hostname: config.http.hostname, port: config.http.port};
      result.qcg = Object.assign(result.qcg, qc);
    }
    if (config.ccdb) {
      result.ccdb = config.ccdb;
    }
    if (config.consul) {
      result.consul = config.consul;
    }
    if (config.quality_control) {
      result.quality_control = config.quality_control;
    }
    res.status(200).json(result);
  }
}

/**
 * Global HTTP error handler, sends status 500
 * @param {string} err - Message error
 * @param {Response} res - Response object to send to
 * @param {number} status - status code 4xx 5xx, 500 will print to debug
 */
function errorHandler(err, res, status = 500) {
  if (status === 500) {
    if (err.stack) {
      log.trace(err);
    }
    log.error(err.message || err);
  }
  res.status(status).send({message: err.message || err});
}

/**
 * Helpers
 */

/**
 * Method to extract the tags from a service list. This represents objects that are in online mode.
 * @param {JSON} services
 * @return {Array<JSON>} [{ name: tag1 }, { name: tag2 }]
 */
function getTagsFromServices(services) {
  const tags = [];
  for (const serviceName in services) {
    if (services[serviceName] && services[serviceName].Tags && services[serviceName].Tags.length > 0) {
      const tagsToBeAdded = services[serviceName].Tags;
      tagsToBeAdded.forEach((tag) => tags.push({name: tag}));
    }
  }
  return tags;
}
