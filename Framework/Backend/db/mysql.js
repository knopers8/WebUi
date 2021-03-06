/**
 * @license
 * Copyright CERN and copyright holders of ALICE O2. This software is
 * distributed under the terms of the GNU General Public License v3 (GPL
 * Version 3), copied verbatim in the file "COPYING".
 *
 * See http://alice-o2.web.cern.ch/license for full licensing information.
 *
 * In applying this license CERN does not waive the privileges and immunities
 * granted to it by virtue of its status as an Intergovernmental Organization
 * or submit itself to any jurisdiction.
*/

const mysql = require('mysql');
const assert = require('assert');
const log = new (require('./../log/Log.js'))('MySQL');

/**
 * MySQL pool wrapper
 * @author Adam Wegrzynek <adam.wegrzynek@cern.ch>
 * @author Vladimir Kosmala <vladimir.kosmala@cern.ch>
 */
class MySQL {
  /**
   * Creates pool of connections
   * @param {object} config configuration object including hostname, username, password
   * and database name.
   */
  constructor(config) {
    assert(config, 'Missing MySQL config');
    assert(config.host, 'Missing config value: mysql.host');
    assert(config.user, 'Missing config value: mysql.user');
    assert(config.database, 'Missing config value: mysql.database');
    config.port = (!config.port) ? 3306 : config.port;
    config.password = (!config.password) ? '' : config.password;
    config.timeout = (!config.timeout) ? 60000 : config.timeout;

    this.config = config;
    this.pool = mysql.createPool(config);
  }

  /**
   * Method to test connection of mysql connector once initialized
   * @return {Promise}
   */
  testConnection() {
    return new Promise((resolve, reject) => {
      this.pool.getConnection((error, connection) => {
        if (error) {
          reject(new Error(this.errorHandler(error)));
        } else {
          connection.release();
          resolve();
        }
      });
    });
  }

  /**
   * Prepares and executes query.
   * Sets up 60s timeout.
   * @param {string} query - SQL query
   * @param {array} parameters - parameters to be bound to the query
   * @return {object} promise
   */
  query(query, parameters) {
    return new Promise((resolve, reject) => {
      this.pool.query({
        sql: query,
        timeout: this.config.timeout,
        values: parameters
      }, (error, results) => {
        if (error) {
          reject(new Error(this.errorHandler(error)));
        }
        resolve(results);
      });
    });
  }

  /**
   * Smoothly terminates connection pool
   */
  close() {
    this.pool.end(() => {});
  }

  /**
   * The purpose is to translate MySQL errors to more human readable format
   * @param {Error} err - the error from a catch or callback
   * @return {string} Clear error message
   */
  errorHandler(err) {
    let message;

    if (err.code === 'ER_NO_DB_ERROR') {
      message = `${this.config.database} database not found`;
      log.warn(message);
    } else if (err.code === 'ER_NO_SUCH_TABLE') {
      message = `Table not found in ${this.config.database}`;
      log.warn(message);
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      message = `Unable to connect to mysql on ${this.config.host}:${this.config.port}`;
      log.warn(message);
    } else if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      message = `Access denied for ${this.config.user}`;
      log.warn(message);
    } else {
      message = `MySQL error: ${err.code}, ${err.message}`;
      log.error(message);
    }

    return message;
  }
}

module.exports = MySQL;
