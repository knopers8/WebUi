const {Log, WebSocketMessage, InfoLoggerReceiver} = require('@aliceo2/web-ui');
const log = new Log('InfoLogger');
const config = require('./configProvider.js');
const SQLDataSource = require('./SQLDataSource.js');
const {MySQL} = require('@aliceo2/web-ui');
const JsonFileConnector = require('./JSONFileConnector.js');
const projPackage = require('./../package.json');

let querySource = null;
let liveSource = null;


const jsonDb = new JsonFileConnector(config.dbFile || __dirname + '/../db.json');

if (config.mysql) {
  log.info(`Detected InfoLogger database configuration`);
  const connection = new MySQL(config.mysql);
  connection.testConnection().catch((error) => {
    console.log("NU EMRGE")
    connection = null;
  });
  if (connection) {
    try {
      querySource = new SQLDataSource(connection, config.mysql);
      querySource.isConnectionUpAndRunning()
        .catch(() => {
          querySource = null;
          log.error('Unable to connect to provided MySQL Data Source');
        });
    } catch (error) {
      log.error(`Unable to use MySQL Data Source due to ${error}`);
    }
  }
} else {
  log.warn(`InfoLogger database config not found, Query mode not available`);
}

if (config.infoLoggerServer) {
  log.info(`InfoLogger server config found`);
  liveSource = new InfoLoggerReceiver();
  liveSource.connect(config.infoLoggerServer);
} else {
  log.warn(`InfoLogger server config not found, Live mode not available`);
}

module.exports.attachTo = (http, ws) => {
  // expose available services
  http.post('/services', (req, res) => {
    res.json({
      query: !!querySource,
      live: !!liveSource,
      streamHostname: config.infoLoggerServer && config.infoLoggerServer.host
    });
  });

  http.post('/query', (req, res) => {
    if (querySource !== null) {
      querySource.queryFromFilters(req.body.criterias, req.body.options)
        .then((result) => res.json(result))
        .catch((error) => handleError(res, error));
    } else {
      handleError(res, 'MySQL Data Source is not available');
    }
  });

  http.get('/getFrameworkInfo', getFrameworkInfo);

  http.get('/getUserProfile', getUserProfile);

  http.post('/saveUserProfile', saveUserProfile);

  /**
   * Method which handles the request for framework information
   * @param {Request} req
   * @param {Response} res
   */
  function getFrameworkInfo(req, res) {
    if (!config) {
      handleError(res, 'Unable to retrieve configuration of the framework', 502);
    } else {
      const result = {};
      result['infoLogger-gui'] = {};
      if (projPackage && projPackage.version) {
        result['infoLogger-gui'].version = projPackage.version;
      }
      if (config.http) {
        const il = {hostname: config.http.hostname, port: config.http.port};
        result['infoLogger-gui'] = Object.assign(result['infoLogger-gui'], il);
      }
      if (config.infoLoggerServer) {
        const ils = {host: config.infoLoggerServer.host, port: config.infoLoggerServer.port};
        result.infoLoggerServer = ils;
      }
      res.status(200).json(result);
    }
  }

  /**
   * Method which handles the request for the user profile
   * @param {Request} req
   * @param {Response} res
   */
  function getUserProfile(req, res) {
    const user = parseInt(req.query.user);
    jsonDb.getProfileByUsername(user).then((profile) => {
      if (profile) {
        res.status(200).json(profile);
      } else {
        const defaultUserConfig = {
          date: {size: 'cell-m', visible: false},
          time: {size: 'cell-m', visible: true},
          hostname: {size: 'cell-m', visible: false},
          rolename: {size: 'cell-m', visible: true},
          pid: {size: 'cell-s', visible: false},
          username: {size: 'cell-m', visible: false},
          system: {size: 'cell-s', visible: true},
          facility: {size: 'cell-m', visible: true},
          detector: {size: 'cell-s', visible: false},
          partition: {size: 'cell-m', visible: false},
          run: {size: 'cell-s', visible: false},
          errcode: {size: 'cell-s', visible: true},
          errline: {size: 'cell-s', visible: false},
          errsource: {size: 'cell-m', visible: false},
          message: {size: 'cell-xl', visible: true}
        };
        res.status(200).json({user: 'default', content: {colsHeader: defaultUserConfig}});
      }
    })
      .catch((err) => handleError(res, err));
  }

  /**
  * Method which handles the request for saving the user profile
  * @param {Request} req
  * @param {Response} res
  */
  function saveUserProfile(req, res) {
    const user = parseInt(req.body.user);
    const content = req.body.content;
    jsonDb.getProfileByUsername(user).then((profile) => {
      if (!profile) {
        jsonDb.createNewProfile(user, content)
          .then((newProfile) => {
            if (newProfile) {
              res.status(200).json({message: 'New profile was successfully created and saved'});
            } else {
              res.status(500).json({message: 'Profile was not found and a new profile could not be created'});
            }
          })
          .catch((err) => handleError(res, err));
      } else {
        jsonDb.updateProfile(user, content)
          .then(() => res.status(200).json({message: 'Profile updates were saved successfully'}))
          .catch((err) => handleError(res, err));
      }
    }).catch((err) => handleError(res, err));
  }

  /**
   * Catch all HTTP errors
   * @param {Object} res
   * @param {Error} error
   * @param {number} status
   */
  function handleError(res, error) {
    log.trace(error);
    res.status(500).json({message: error.message});
  }

  if (liveSource) {
    liveSource.on('message', (message) => {
      const msg = new WebSocketMessage();
      msg.command = 'live-log';
      msg.payload = message;
      ws.broadcast(msg);
    });

    liveSource.on('close', () => {
      ws.unfilteredBroadcast(new WebSocketMessage().setCommand('il-server-close'));
    });
  }
};
