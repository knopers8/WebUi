const {WebSocketMessage, ConsulService} = require('@aliceo2/web-ui');
const log = new (require('@aliceo2/web-ui').Log)('Control');

const http = require('http');

const Padlock = require('./Padlock.js');
const KafkaConnector = require('./KafkaConnector.js');

const ControlProxy = require('./control-core/ControlProxy.js');
const ControlService = require('./control-core/ControlService.js');

const config = require('./configProvider.js');
const projPackage = require('./../package.json');

if (!config.grpc) {
  throw new Error('grpc field in config file is needed');
}
if (!config.grafana) {
  log.error('[Grafana] Configuration is missing');
}

let consulService;
initializeConsulService();

const padLock = new Padlock();
const ctrlProxy = new ControlProxy(config.grpc);
const ctrlService = new ControlService(padLock, ctrlProxy);

module.exports.setup = (http, ws) => {
  ctrlProxy.methods.forEach((method) =>
    http.post(`/${method}`, (req, res) => ctrlService.executeCommand(req, res)));
  http.post('/lockState', (req, res) => res.json(padLock));
  http.post('/lock', lock);
  http.post('/unlock', unlock);
  http.get('/getPlotsList', getPlotsList);
  http.get('/getFrameworkInfo', getFrameworkInfo);
  http.get('/getCRUs', getCRUs);

  const kafka = new KafkaConnector(config.kafka, ws);
  if (kafka.isKafkaConfigured()) {
    kafka.initializeKafkaConsumerGroup();
  }

  /**
   * Send to all users state of Pad via Websocket
   */
  const broadcastPadState = () => {
    ws.broadcast(new WebSocketMessage().setCommand('padlock-update').setPayload(padLock));
  };

  /**
   * Method to try to acquire lock
   * @param {Request} req
   * @param {Response} res
   */
  function lock(req, res) {
    try {
      padLock.lockBy(req.session.personid, req.session.name);
      log.info(`Lock taken by ${req.session.name}`);
      res.json({ok: true});
    } catch (error) {
      log.warn(`Unable to lock by ${req.session.name}: ${error}`);
      res.status(403).json({message: error.toString()});
      return;
    }
    broadcastPadState();
  }

  /**
   * Method to try to release lock
   * @param {Request} req
   * @param {Response} res
   */
  function unlock(req, res) {
    try {
      padLock.unlockBy(req.session.personid);
      log.info(`Lock released by ${req.session.name}`);
      res.json({ok: true});
    } catch (error) {
      log.warn(`Unable to give away lock by ${req.session.name}: ${error}`);
      res.status(403).json(error);
      return;
    }
    broadcastPadState();
  }
};

/**
 * Method to build a list of plots source
 * @param {Request} req
 * @param {Response} res
 */
function getPlotsList(req, res) {
  if (!config.grafana || !config.http.hostname || !config.grafana.port) {
    log.error('[Grafana] Configuration is missing');
    res.status(503).json({message: 'Plots service configuration is missing'});
  } else {
    const host = config.http.hostname;
    const port = config.grafana.port;
    httpGetJson(host, port, '/api/health')
      .then((result) => {
        log.info(`Grafana is up and running on version: ${result.version}`);
        const hostPort = `http://${host}:${port}/`;
        const valueOne = 'd-solo/TZsAxKIWk/readout?orgId=1&panelId=6 ';
        const valueTwo = 'd-solo/TZsAxKIWk/readout?orgId=1&panelId=8';
        const plot = 'd-solo/TZsAxKIWk/readout?orgId=1&panelId=4';
        const theme = '&refresh=5s&theme=light';
        const response = [hostPort + valueOne + theme, hostPort + valueTwo + theme, hostPort + plot + theme];
        res.status(200).json(response);
      })
      .catch((error) => errorHandler(`[Grafana] - Unable to connect due to ${error}`, res, 503));
    return;
  }
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
    result['control-gui'] = {};
    if (projPackage && projPackage.version) {
      result['control-gui'].version = projPackage.version;
    }
    if (config.http) {
      const con = {hostname: config.http.hostname, port: config.http.port};
      result['control-gui'] = Object.assign(result['control-gui'], con);
    }
    if (config.grpc) {
      result.grpc = config.grpc;
    }
    if (config.grafana) {
      result.grafana = config.grafana;
    }
    if (config.kafka) {
      result.kafka = config.kafka;
    }
    res.status(200).json(result);
  }
}

/**
 * Method to request all CRUs available in consul KV store
 * @param {Request} req
 * @param {Response} res
 */
function getCRUs(req, res) {
  if (consulService) {
    const cruPath = config.consul.cruPath ? config.consul.cruPath : 'o2/hardware/flps';
    const regex = new RegExp(`.*/.*/cards`);
    consulService.getOnlyRawValuesByKeyPrefix(cruPath).then((data) => {
      const crusByHost = {};
      Object.keys(data)
        .filter((key) => key.match(regex))
        .forEach((key) => {
          const splitKey = key.split('/');
          const hostKey = splitKey[splitKey.length - 2];
          crusByHost[hostKey] = JSON.parse(data[key]);
        });
      res.status(200).json(crusByHost);
    }).catch((error) => {
      if (error.message.includes('404')) {
        errorHandler(`Could not find any CRUs by key ${cruPath}`, res, 404);
      }
      errorHandler(error, res, 502);
    });
  } else {
    errorHandler('Unable to retrieve configuration of consul service', res, 502);
  }
}

/**
 * Global HTTP error handler, sends status 500
 * @param {string} err - Message error
 * @param {Response} res - Response object to send to
 * @param {number} status - status code 4xx 5xx, 500 will print to debug
 */
function errorHandler(err, res, status = 500) {
  if (status > 500) {
    if (err.stack) {
      log.trace(err);
    }
    log.error(err.message || err);
  }
  res.status(status).send({message: err.message || err});
}

/**
  * Util to get JSON data (parsed) from server
  * @param {string} host - hostname of the server
  * @param {number} port - port of the server
  * @param {string} path - path of the server request
  * @return {Promise.<Object, Error>} JSON response
  */
function httpGetJson(host, port, path) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      hostname: host,
      port: port,
      path: path,
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    };
    /**
     * Generic handler for client http requests,
     * buffers response, checks status code and parses JSON
     * @param {Response} response
     */
    const requestHandler = (response) => {
      if (response.statusCode < 200 || response.statusCode > 299) {
        reject(new Error('Non-2xx status code: ' + response.statusCode));
        return;
      }

      const bodyChunks = [];
      response.on('data', (chunk) => bodyChunks.push(chunk));
      response.on('end', () => {
        try {
          const body = JSON.parse(bodyChunks.join(''));
          resolve(body);
        } catch (e) {
          reject(new Error('Unable to parse JSON'));
        }
      });
    };

    const request = http.request(requestOptions, requestHandler);
    request.on('error', (err) => reject(err));
    request.end();
  });
}

/**
 * Method to check if consul service can be used
 */
function initializeConsulService() {
  if (!config.consul) {
    log.error('Consul configuration is missing');
  } else {
    consulService = new ConsulService(config.consul);
    consulService.getConsulLeaderStatus()
      .then((data) => log.info(`Consul service is up and running on: ${data}`))
      .catch((error) => log.error(`Could not contact Consul Service due to ${error}`));
  }
}
