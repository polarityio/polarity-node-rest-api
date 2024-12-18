/*
 * Copyright (c) 2024, Polarity.io, Inc.
 */

const request = require('postman-request');
const fs = require('fs');
const winston = require('winston');
const ApiError = require('./api-error');
const { promisify } = require('util');

/**
 * Accepts a Bunyan logging object.  If none is provided and `NODE_ENV` is set
 * to `development` the library will log to the console.  If `NODE_ENV` is not
 * set to `development` and no logging object is passed in then the library will
 * not output any logging
 */
class Polarity {
  constructor(log) {
    this.postmanRequest = null;
    if (log) {
      this.logger = log;
    } else if (process.env.NODE_ENV === 'development') {
      this.logger = winston.createLogger({
        level: process.env.POLARITY_LOG_LEVEL || 'info',
        format: winston.format.json(),
        defaultMeta: { service: 'polarity-node-rest-api' },
        transports: [new winston.transports.Console()]
      });
    } else {
      const noop = () => ({});
      this.logger = {
        error: noop,
        warn: noop,
        info: noop,
        debug: noop
      };
    }
    this.isConnected = false;
    this.host = null;
  }


  isInitialized() {
    return this.connectOptions !== null;
  }

  isDisconnected() {
    return !this.isConnected;
  }

  async _login() {
    if (this.connectOptions === null) {
      throw new Error(
        'Connection option must be provided via `connect()` method before trying to run _login'
      );
    }

    let requestOptions = {
      uri: `${this.connectOptions.host}/api/users/login`,
      method: 'POST',
      body: {
        identification: this.connectOptions.username,
        password: this.connectOptions.password
      }
    };

    const response = await this.postmanRequest(requestOptions);

    if (response.statusCode === 200) {
      const token = response.body.data.token;
      this.postmanRequest = this.postmanRequest.defaults({
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      this.isConnected = true;
      this.logger.debug('Successfully connected to Polarity Server', { token });
    } else {
      throw new ApiError('Could not login to Polarity', {
        statusCode: response.statusCode,
        meta: {
          response
        }
      });
    }
  }

  _createDefaultRequest(connectOptions) {
    let defaults = {};

    if (
      typeof connectOptions !== 'undefined' &&
      typeof connectOptions.request !== 'undefined'
    ) {
      if (
        typeof connectOptions.request.cert === 'string' &&
        connectOptions.request.cert.length > 0
      ) {
        defaults.cert = fs.readFileSync(connectOptions.request.cert);
      }

      if (
        typeof connectOptions.request.key === 'string' &&
        connectOptions.request.key.length > 0
      ) {
        defaults.key = fs.readFileSync(connectOptions.request.key);
      }

      if (
        typeof connectOptions.request.passphrase === 'string' &&
        connectOptions.request.passphrase.length > 0
      ) {
        defaults.passphrase = connectOptions.request.passphrase;
      }

      if (
        typeof connectOptions.request.ca === 'string' &&
        connectOptions.request.ca.length > 0
      ) {
        defaults.ca = fs.readFileSync(connectOptions.request.ca);
      }

      if (
        typeof connectOptions.request.proxy === 'string' &&
        connectOptions.request.proxy.length > 0
      ) {
        defaults.proxy = connectOptions.request.proxy;
      }

      if (typeof connectOptions.request.rejectUnauthorized === 'boolean') {
        defaults.rejectUnauthorized = connectOptions.request.rejectUnauthorized;
      }
    }

    defaults.json = true;
    defaults.headers = {
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json'
    };
    defaults = { ...defaults, ...this.connectOptions.request };

    this.logger.debug('Setup default request configuration', { defaults });

    return promisify(request.defaults(defaults));
  }

  /**
   * Will send an HTTP REST request using the provided `requestOptions`.  If the server returns a 401 unauthenticated
   * this method will try to reauthenticate 1 time.  This is to cover cases where the existing auth token has expired.
   *
   * @param requestOptions
   * @param retryCount
   * @returns {Promise<*>}
   */
  async retryableRequest(requestOptions, retryCount = 0) {
    let response = await this.postmanRequest(requestOptions);
    if (response.statusCode === 401 && retryCount < 1) {
      this.logger.debug(`Failed to connect, attempting retry: ${retryCount}`, { response });
      await this._login();
      await this.retryableRequest(requestOptions, ++retryCount);
    } else {
      return response;
    }
  }

  /**
   * Connect to the Polarity Server (must be called once before using other methods).
   *
   * @param connectOptions
   * {
   *   host: <polarity-host>
   *   username: <polarity-username>,
   *   password: <polarity-password>,
   *   request : { // optional request library options to apply
   *     rejectUnauthorized: true/false,
   *     proxy: '',
   *     cert: '',
   *     key: '',
   *     passphrase: ''
   *     ca: ''
   *   }
   * }
   *
   * @returns {Promise<unknown>}
   */
  async connect(connectOptions) {
    this.connectOptions = connectOptions;
    this.host = connectOptions.host;
    this.postmanRequest = this._createDefaultRequest(connectOptions);

    return await this._login();
  }

  /**
   * Disconnect the connected Polarity client.  Can only be called after the connect() method has been
   * called.
   *
   * @returns {Promise<*>}
   */
  async disconnect() {
    if (!this.isInitialized()) {
      throw new Error(
        'Polarity must be initialized with connection options via `connect()` before trying to parse entities'
      );
    }

    if (this.isDisconnected()) {
      throw new Error('Polarity must be connected before trying to disconnect');
    }

    let requestOptions = {
      uri: `${this.host}/api/users/logout`,
      method: 'POST'
    };

    let response = await this.postmanRequest(requestOptions);

    if (response.statusCode !== 200) {
      throw new ApiError(`Failed to disconnect`, {
        statusCode: response.statusCode,
        meta: {
          response,
          requestOptions
        }
      });
    }

    this.isConnected = false;
    this.host = null;
    
    this.logger.debug('Disconnected from Polarity server');

    return response.body;
  }

  async parseEntities(text) {
    if (!this.isInitialized()) {
      throw new Error(
        'Polarity must be initialized with connection options via `connect()` before trying to parse entities'
      );
    }

    if (this.isDisconnected()) {
      throw new Error('Polarity must be connected before trying to disconnect');
    }

    const requestOptions = {
      uri: `${this.host}/api/parsed-entities`,
      method: 'POST',
      body: {
        data: {
          attributes: {
            text
          }
        }
      }
    };

    this.logger.debug('parseEntities Request Options', { requestOptions });
    const response = await this.retryableRequest(requestOptions);

    if (response.statusCode === 200) {
      this.logger.debug('parseEntities Results', { body: response.body });
      return response.body;
    } else {
      this.logger.error('Error running parseEntities', { response });
      throw new ApiError(`Failed to run parse entities`, {
        statusCode: response.statusCode,
        meta: {
          response,
          requestOptions
        }
      });
    }
  }
}

module.exports = Polarity;
