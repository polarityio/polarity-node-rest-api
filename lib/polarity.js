const async = require('async');
const request = require('postman-request');
const fs = require('fs');
const winston = require('winston');
const { isIP4r, validateEntity, validateTag } = require('./validator');
const inflected = require('inflected');
const { getIntegrationId } = require('./helpers');
const { toError } = require('./error');

/**
 * Accepts a Winston logging object.  If none is provided and `NODE_ENV` is set
 * to `development` the library will log to the console.  If `NODE_ENV` is not
 * set to `development` then the library will not output any logging
 */
class Polarity {
  constructor(log) {
    this.postmanRequest = null;
    if (log) {
      this.logger = log;
    } else if (process.env.NODE_ENV === 'development') {
      this.logger = winston.createLogger({
        level: 'info',
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
        debug: noop,
        trace: noop
      };
    }
    this.isConnected = false;
    this.host = null;
  }

  parseErrorToReadableJSON(error) {
    return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));
  }

  /**
   * Connect to the Polarity Server (must be called once before using other methods)
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
    let self = this;

    this.postmanRequest = this._createDefaultRequest(connectOptions);

    const authVersion = await this._getAuthAPIVersion(connectOptions.host);

    let requestOptions = {
      uri: `${connectOptions.host}/${authVersion}/authenticate`,
      method: 'POST',
      body: {
        identification: connectOptions.username,
        password: connectOptions.password
      }
    };

    requestOptions = { ...requestOptions, ...connectOptions.connection };

    return new Promise((resolve, reject) => {
      this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          self.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          self.isConnected = true;
          self.host = connectOptions.host;
          resolve(body);
        } else {
          self.logger.error(err);
          reject({
            detail: 'Could not authenticate to Polarity',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  /**
   * Internal use method that returns the auth API version (either 'v1' or 'v2')
   * Servers that are version 4.x+ will have a `saml-enabled` attributes on the `GET /v2/servers` endpoint and use
   * the `v2` auth endpoint
   *
   * @returns {Promise<unknown>}
   * @private
   */
  async _getAuthAPIVersion(host) {
    return new Promise((resolve, reject) => {
      let requestOptions = {
        uri: `${host}/v2/servers`,
        method: 'GET',
        json: true
      };

      this.postmanRequest(requestOptions, (err, response, body) => {
        if (err || response.statusCode !== 200) {
          return reject({
            detail: 'HTTP Request Error',
            err: this.parseErrorToReadableJSON(err),
            response
          });
        }

        if (typeof body.data.attributes['saml-enabled'] !== 'undefined') {
          resolve('v2');
        } else {
          resolve('v1');
        }
      });
    });
  }

  /**
   * Disconnects (logs out) the Polarity client
   *
   * @returns {Promise<unknown>}
   */
  async disconnect() {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({
          detail: 'Polarity must be connected before trying to disconnect'
        });
      }

      let requestOptions = {
        uri: `${this.host}/v1/authenticate`,
        method: 'DELETE',
        json: true
      };

      this.postmanRequest(requestOptions, (err, response, body) => {
        if (err || response.statusCode !== 200) {
          return reject({
            detail: 'HTTP Request Error',
            response,
            err
          });
        }

        this.isConnected = false;
        this.host = null;

        resolve(body);
      });
    });
  }

  isDisconnected() {
    return !this.isConnected;
  }

  /**
   * Creates a new user
   * @param attributes
   * ```
   * {
   *    username: {string} user accounts username,
   *    password: {string} user accounts password,
   *    email: {string} user accounts email address,
   *    fullName: {string} user account's full name,
   *    isAdmin: {boolean} [false] if true, the user account will be an admin,
   *    isLocal: {boolean} [true] if false, the user account will be considered 'remote',
   *    enabled: {boolean} [true] if false, the user account will not be enabled
   *    forcePasswordReset: {boolean} [true] if false, the user will not be required to change their password on initial login   *
   * }
   * ```
   * @returns {Promise<void>}
   */
  async createUser(attributes, includePasswordInWelcomeEmail = false) {
    return new Promise((resolve, reject) => {
      let renamedAttributes = {};

      // Set default values for optional attributes
      const { isAdmin = false, isgLocal = true, enabled = true, ...requiredAttributes } = attributes;

      // Convert camelcase attributes to dasherized for REST API format
      for (const [key, value] of Object.entries({ isAdmin, isLocal, enabled, ...requiredAttributes })) {
        renamedAttributes[inflected.dasherize(inflected.underscore(key))] = value;
      }

      const requestOptions = {
        uri: `${this.host}/v1/users`,
        method: 'POST',
        json: true,
        body: {
          data: {
            type: 'users',
            attributes: renamedAttributes
          }
        },
        qs: {
          'option[includePasswordInWelcomeEmail]': includePasswordInWelcomeEmail
        }
      };

      this.logger.debug({ requestOptions }, 'Create User');

      this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          resolve(body);
        } else {
          this.logger.error('Error creating user', { body });
          reject({
            detail: `Failed to create user "${renamedAttributes.username}"`,
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  /**
   * Clears the given channel name (i.e., removes all channel content).
   * @param channelName
   * @returns {Promise<unknown>} true if the channel was cleared, false if the channel does not exist
   */
  async clearChannel(channelName) {
    return new Promise(async (resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({
          detail: 'Polarity must be connected before trying to clear a channel by name'
        });
      }

      try {
        const channel = await this.getChannel(channelName);

        if (channel) {
          this.logger.debug(`clearChannelByName(): Channel name ${channelName} has channel id ${channel.id}`);
          resolve(await this.clearChannelById(channel.id));
        } else {
          resolve(false);
        }
      } catch (clearChannelError) {
        reject(clearChannelError);
      }
    });
  }

  /**
   * If the channel with the given `channelName` exists, this method will return a channel object.
   * If the channel does not exist, the method will return `undefined`.  If there was an error,
   * the method will throw the error.
   *
   * @param channelName
   * @returns {Promise<unknown>}
   */
  async getChannel(channelName) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to get a channel id' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/channels`,
        qs: {
          'filter[channel.channel-name]': channelName.toLowerCase()
        },
        method: 'GET'
      };

      this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          const channel = body.data.find((channel) => {
            return channel.attributes['channel-name'] === channelName;
          });

          if (channel) {
            resolve(channel);
          } else {
            resolve();
          }
        } else {
          this.logger.error('Error retrieving channel', { body });
          reject({
            detail: `Failed to get channel "${channelName}"`,
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  /**
   *
   * @param integrations Array of integration ids
   * @param text text to parse and extra entities from.  Text must be less than 5,000 characters
   * @param ignoreLookupErrors boolean indicating whether errors should be ignored
   * @returns {Promise<unknown>}
   */
  async searchIntegrations(integrations, text, ignoreLookupErrors = false) {
    return new Promise(async (resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to run an integration lookup' });
      }

      if (text.length > 5000) {
        return reject({ details: 'Text length must be less than 5000 characters' });
      }

      const resultsByIntegration = integrations.reduce((accum, integrationId) => {
        accum[integrationId] = [];
        return accum;
      }, {});
      const errorsByIntegration = integrations.reduce((accum, integrationId) => {
        accum[integrationId] = [];
        return accum;
      }, {});

      let entities;
      try {
        const result = await this.parseEntities(text);
        entities = result.data.attributes.entities;
      } catch (parseErr) {
        this.logger.error('Error parsing text', parseErr);
        reject(parseErr);
      }

      await async.eachLimit(integrations, 10, async (integrationId) => {
        try {
          const response = await this.integrationLookup(integrationId, entities);
          const results = response.data.attributes.results;
          if (Array.isArray(results)) {
            results.forEach((result) => {
              resultsByIntegration[integrationId].push(result);
            });
          }
        } catch (lookupErr) {
          this.logger.error(`Error looking up entities in integration ${integrationId}`, {
            lookupErr,
            entities
          });
          if (ignoreLookupErrors) {
            errorsByIntegration[integrationId].push(lookupErr);
          } else {
            reject(lookupErr);
          }
        }
      });
      resultsByIntegration.__errors = errorsByIntegration;
      resolve(resultsByIntegration);
    });
  }

  async integrationLookup(integrationId, parsedEntities) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to run an integration lookup' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/integration-lookups/${integrationId}`,
        method: 'POST',
        body: {
          data: {
            type: 'integration-lookups',
            attributes: {
              entities: parsedEntities
            }
          }
        }
      };

      return this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          resolve(body);
        } else {
          this.logger.error(`Error Running Integration Lookup ${integrationId}`, { body });
          reject({
            detail: `Failed to run integration lookup for ${integrationId}`,
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  async parseEntities(text) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to parseEntities' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/parsed-entities`,
        method: 'POST',
        body: {
          text
        }
      };

      return this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          resolve(body);
        } else {
          this.logger.error('Error Parsing Entities', { body });
          reject({
            detail: 'Failed to parse text',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  async getIntegrations() {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to get integrations' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/integrations`,
        method: 'GET'
      };

      return this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          resolve(body);
        } else {
          this.logger.error('Error Getting Integrations', { body });
          reject({
            detail: 'Failed to get integrations',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  async request(requestOptions) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before running a request' });
      }

      return this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        return resolve(response);
      });
    });
  }

  /**
   *
   * @param options
   * pageSize
   * pageNumber
   * @returns {Promise<unknown>}
   */
  async getUsers(options) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to get users' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/users`,
        method: 'GET',
        qs: {}
      };

      if (options.pageSize) {
        requestOptions.qs['page[size]'] = options.pageSize;
      }

      if (options.pageNumber) {
        requestOptions.qs['page[number]'] = options.pageNumber;
      } else {
        requestOptions.qs['page[number]'] = 1;
      }

      if (options.filters) {
        let keys = Object.keys(options.filters);
        keys.forEach((key) => {
          requestOptions.qs[`filter[${key}]`] = options.filters[key];
        });
      }

      return this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          resolve(body);
        } else {
          this.logger.error('Error Getting Users', { body });
          reject({
            detail: 'Failed to get users',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  async getIntegrationOptions(integrationId) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to clear a channel' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/integration-options`,
        method: 'GET',
        qs: {
          'filter[integration.id]': integrationId
        }
      };

      return this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          resolve(body);
        } else {
          this.logger.error('Error Getting Integration Options', { body });
          reject({
            detail: 'Failed to get integration options',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  /**
   *
   * @param channelId
   * @param waitUntilComplete {boolean} [true] If true, this method will not return until the channel is
   * completely clear.  If set to set false, after 30 seconds, the method will return either a timeout payload
   * where the `clearComplete` attribuet is `false`:
   * ```
   * {
   *   "clearComplete": false
   *   "meta": {
   *     "timeout": 30000
   *    }
   * }
   * ```
   * or a completion payload where the `clearComplete` payload is `true`:
   * ```
   * {
   *   "clearComplete": true,
   *   "meta": {
   *     "num-context-rows-deleted": 0,
   *     "num-vote-rows-deleted": 0,
   *     "num-comment-rows-deleted": 0,
   *     "num-history-rows-deleted": 0,
   *     "is-channel-deleted": false
   *   }
   * }
   * ```
   * @returns {Promise<unknown>}
   */
  async clearChannelById(channelId, waitUntilComplete = true) {
    const CLEAR_CHANNEL_CHECK_INTERVAL = 30000; // 30 seconds
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to clear a channel' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/channels/${channelId}?option[clearChannel]=true`,
        method: 'DELETE'
      };

      return this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        // The clear channel endpoint returns a 200 if the channel is done clearing.
        // Returns 202 if the request was accepted but the channel has not finished clearing.
        if (response.statusCode === 200 || (response.statusCode === 202 && waitUntilComplete === false)) {
          body.clearComplete = true;
          resolve(body);
        } else if (waitUntilComplete && response.statusCode === 202) {
          // start polling
          const pollingInterval = setInterval(async () => {
            try {
              this.logger.debug(`Waiting for channel ${channelId} to clear`);
              const isEmpty = await this.isChannelEmpty(channelId);
              if (isEmpty) {
                this.logger.debug(`Channel ${channelId} is now clear`);
                clearInterval(pollingInterval);
                body.clearComplete = true;
                resolve(body);
              }
            } catch (isChannelEmptyErr) {
              const errorObj = toError('Polling of channel status failed', isChannelEmptyErr, {
                body,
                response
              });

              this.logger.error('Error Clearing Channel', { errorObj });

              clearInterval(pollingInterval);
              reject(errorObj);
            }
          }, CLEAR_CHANNEL_CHECK_INTERVAL);
        } else {
          this.logger.error('Error Clearing Channel', { body });
          reject({
            detail: 'Failed to clear channel',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  async isChannelEmpty(channelId) {
    const options = {
      'option[count]': false,
      'option[searchTags]': false,
      'option[searchComments]': false,
      'option[searchEntities]': true,
      'option[searchAllUsers]': true,
      'option[searchLoggedInUser]': false,
      'option[searchSelectedUsers]': false,
      'page[number]': 1,
      'page[size]': 1,
      'filter[tag-entity-pair.channel-id]': channelId
    };

    const result = await this.search(options);

    if (result.data && result.data.length === 0) {
      return true;
    }

    return false;
  }

  async search(options) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to clear a channel' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/searchable-items`,
        method: 'GET',
        qs: options
      };

      return this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          resolve(body);
        } else {
          this.logger.error('Error searching', { body });
          reject({
            detail: 'Failed to search',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  async createChannel(channelName, channelDescription = '') {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to create a channel' });
      }

      let requestOptions = {
        uri: `${this.host}/v2/channels`,
        method: 'POST',
        body: {
          data: {
            type: 'channels',
            attributes: {
              'channel-name': channelName,
              description: channelDescription
            }
          }
        }
      };

      this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 201) {
          resolve(body);
        } else {
          this.logger.error('Error Creating Channel', { body });
          reject({
            detail: 'Failed to create channel',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  /**
   * Restarts the given integration based on the integration's directory name
   *
   * @param integrationDirectoryName, the name of the integration's directory
   * @returns {Promise<unknown>}
   */
  async restartIntegration(integrationDirectoryName) {
    const integrationId = getIntegrationId(integrationDirectoryName);
    return await this.restartIntegrationById(integrationId);
  }

  /**
   * Updates the given integration's options
   *
   * @param integrationId, the internal id of the Polarity integration (note: this is not the
   * necessarily the name of the integration's directory.  Take the name of the integration directory
   * and replace dashes and periods with underscores.
   * @param optionName, the name of the option (can be found from the integration's `config.js`
   * @param optionValue, the new value of the option.  Please note that not all options are validated properly so
   * ensure the value you are sending in is appropriate for the specific option.
   * @returns {Promise<unknown>}
   */
  async updateIntegrationOption(integrationId, optionName, optionAttributes) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to update an integration option' });
      }

      if (typeof optionAttributes['admin-only'] !== 'boolean') {
        return reject({ detail: 'optionAttributes must include an `admin-only` boolean property' });
      }

      if (typeof optionAttributes['user-can-edit'] !== 'boolean') {
        return reject({ detail: 'optionAttributes must include an `user-can-edit` boolean property' });
      }

      if (typeof optionAttributes['value'] === 'undefined') {
        return reject({ detail: 'optionAttributes must include an `value` property' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/integration-options`,
        method: 'PATCH',
        body: {
          data: [
            {
              type: 'integration-options',
              id: `${integrationId}-${optionName}`,
              attributes: optionAttributes
            }
          ]
        }
      };

      this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          resolve(body);
        } else {
          this.logger.error('Error updating option', { body });
          reject({
            detail: 'Failed to update integration option',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  /**
   * Restarts the given integration based on the integration's unique identifier
   *
   * @param integrationId, the internal id of the Polarity integration (note: this is not the
   * necessarily the name of the integration's directory.  If unsure, use `restartIntegration`
   * and pass the name of the integration's directory.
   * @returns {Promise<unknown>}
   */
  async restartIntegrationById(integrationId) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to restart an integration' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/integrations/${integrationId}/restart`,
        method: 'GET'
      };

      this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          resolve(body);
        } else {
          this.logger.error('Error Restarting Integration', { body });
          reject({
            detail: 'Failed to restart integration',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  /**
   *
   * @param rows a two dimensional array of the format:
   * ```
   * [
   *   ["entityA", "tag1", "tag2", "tag3"],
   *   ["entityB", "tag4"],
   *   ["entityC", "tag2"]
   * ]
   * ```
   * @param channelId {number} the channel id to apply tags into
   * @param stopOnInvalidData {boolean} [false] if true the operation will stop as soon as an invalid tag
   * or entity is encountered.
   * @returns {Promise<unknown>}
   */
  async applyTags(rows, channelId, stopOnInvalidData = false) {
    return new Promise(async (resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to getTagsByEntityValue()' });
      }

      try {
        const MAX_TAG_ENTITIES_PER_REQUEST = 2000;
        let uploadResult;
        let data = [];
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          const row = rows[rowIndex];
          const entity = row[0].trim();
          const entityError = validateEntity(entity);

          if (entityError && stopOnInvalidData) {
            throw new Error(entityError);
          } else if (entityError) {
            // skip importing this row if the entity was invalid
            continue;
          }

          for (let columnIndex = 1; columnIndex < row.length; columnIndex++) {
            const tag = row[columnIndex].trim();
            const tagError = validateTag(tag);
            if (tagError && stopOnInvalidData) {
              throw new Error(tagError);
            } else if (tagError) {
              // skip importing this tag if the tag was invalid
              continue;
            }
            data.push(this._createTagEntityPair(entity, tag, [channelId]));
          }

          if (data.length >= MAX_TAG_ENTITIES_PER_REQUEST) {
            uploadResult = await this._applyTags(data);
            data = [];
          }
        }

        if (data.length > 0) {
          uploadResult = await this._applyTags(data);
        }

        resolve(uploadResult);
      } catch (e) {
        console.info(e);
        reject(e);
      }
    });
  }

  // /**
  //  *
  //  * @param entityValue {String} An entity value
  //  * @param tags {Array|String} Array of tags as strings
  //  * @param channels {Array|String} Array of channel ids as strings
  //  * @param cb callback which returns tag generation statistics
  //  * @returns {*}
  //  */
  // applyTags(entityValue, tags, channels, cb) {
  //   let self = this;
  //
  //   if (this.isDisconnected()) {
  //     return cb('Polarity must be connected before trying to applyTags()');
  //   }
  //
  //   let data = [];
  //
  //   if (tags.length === 0 || channels.length === 0) {
  //     return cb('You must provide at least one tag and one channel when applying tags');
  //   }
  //
  //   tags.forEach((tag) => {
  //     data.push({
  //       type: 'tag-entity-pairs',
  //       attributes: {
  //         tag: tag,
  //         entity: entityValue,
  //         'channel-id': channels,
  //         type: 'string',
  //         confidence: 0
  //       }
  //     });
  //   });
  //
  //   let requestOptions = {
  //     uri: this.host + '/v2/tag-entity-pairs',
  //     method: 'POST',
  //     json: true,
  //     jar: this.cookieJar,
  //     body: {
  //       data: data
  //     }
  //   };
  //
  //   this.postmanRequest(requestOptions, function(err, response, body) {
  //     if (err) {
  //       return cb({
  //         detail: 'HTTP Request Error while attempting to apply tags',
  //         err: err
  //       });
  //     }
  //
  //     if (response.statusCode !== 201) {
  //       return cb({
  //         detail: 'Error when attempting to apply tags',
  //         statusCode: response.statusCode,
  //         body: body
  //       });
  //     }
  //
  //     cb(null, body);
  //   });
  // }

  /**
   * Get Tags for the given `entityValue` from the given `channels`
   * @param entityValue {String}
   * @param channels {Array} An array of numeric ids or an empty array if you want tags from all channels to be returned
   * @param cb {Function} callback
   * @return {Array} An array of tags
   */
  getTagsByEntityValue(entityValue, channels, cb) {
    let self = this;

    if (this.isDisconnected()) {
      return cb('Polarity must be connected before trying to getTagsByEntityValue()');
    }

    async.waterfall(
      [
        function getEntityId(next) {
          self.getEntityId(entityValue, channels, next);
        },
        function getTags(entityId, next) {
          self.getTagsByEntityId(entityId, next);
        }
      ],
      cb
    );
  }

  getTagsByEntityId(entityId, cb) {
    if (this.isDisconnected()) {
      return cb('Polarity must be connected before trying to getTags()');
    }

    let tags = [];

    if (entityId === null) {
      return cb(null, []);
    }

    let requestOptions = {
      uri: this.host + '/v2/entities/' + entityId,
      method: 'GET',
      json: true,
      jar: this.cookieJar
    };

    this.postmanRequest(requestOptions, function (err, response, body) {
      if (err) {
        return cb({
          detail: 'HTTP Request Error while attempting to retrieve tags from Polarity',
          err: err
        });
      }

      if (response.statusCode !== 200) {
        return cb({
          detail: 'Error while trying to retrieve tags',
          statusCode: response.statusCode,
          body: body
        });
      }

      body.included.forEach((item) => {
        if (item.type === 'tags') {
          tags.push(item.attributes['tag-name']);
        }
      });

      cb(err, tags);
    });
  }

  /**
   *
   * @param entityValue
   * @param channels
   * @param cb
   * @returns {*}
   */
  getEntityId(entityValue, channels, cb) {
    if (this.isDisconnected()) {
      return cb('Polarity must be connected before trying to getEntityId()');
    }

    let requestOptions = {
      uri: this.host + '/v2/searchable-items',
      method: 'GET',
      qs: {
        'filter[entity.entity-name-lower]': entityValue.toLowerCase(),
        'option[searchEntities]': true,
        'option[searchTags]': false,
        'option[searchComments]': false
      },
      json: true,
      jar: this.cookieJar
    };

    if (channels.length > 0) {
      requestOptions.qs['filter[tag-entity-pair.channel-id'] = channels.join(',');
    }

    this.postmanRequest(requestOptions, function (err, response, body) {
      let match = body.data.find((item) => {
        return item.attributes['searchable-item-name'].toLowerCase() === entityValue;
      });

      if (match) {
        cb(err, match.attributes['entity-id']);
      } else {
        cb(err, null);
      }
    });
  }

  deleteAnnotationById(annotationId) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to delete an annotation' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/tag-entity-pairs/${annotationId}`,
        method: 'DELETE'
      };

      /* // Expected return payload on success (200 status code)
       * {
       *   "meta": {
       *     "num-context-rows-deleted": 1,
       *     "num-vote-rows-deleted": 0,
       *     "num-comment-rows-deleted": 0,
       *     "num-history-rows-deleted": 1,
       *     "is-tag-deleted": true,
       *     "is-entity-deleted": false
       *   }
       * }
       */
      this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          resolve(body);
        } else {
          this.logger.error('Error deleting annotation', { body });
          reject({
            detail: 'Failed to delete annotation',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  _createDefaultRequest(connectOptions) {
    let defaults = {};

    if (typeof connectOptions !== 'undefined' && typeof connectOptions.request !== 'undefined') {
      if (typeof connectOptions.request.cert === 'string' && connectOptions.request.cert.length > 0) {
        defaults.cert = fs.readFileSync(connectOptions.request.cert);
      }

      if (typeof connectOptions.request.key === 'string' && connectOptions.request.key.length > 0) {
        defaults.key = fs.readFileSync(connectOptions.request.key);
      }

      if (typeof connectOptions.request.passphrase === 'string' && connectOptions.request.passphrase.length > 0) {
        defaults.passphrase = connectOptions.request.passphrase;
      }

      if (typeof connectOptions.request.ca === 'string' && connectOptions.request.ca.length > 0) {
        defaults.ca = fs.readFileSync(connectOptions.request.ca);
      }

      if (typeof connectOptions.request.proxy === 'string' && connectOptions.request.proxy.length > 0) {
        defaults.proxy = connectOptions.request.proxy;
      }

      if (typeof connectOptions.request.rejectUnauthorized === 'boolean') {
        defaults.rejectUnauthorized = connectOptions.request.rejectUnauthorized;
      }
    }

    defaults.jar = request.jar();
    defaults.json = true;

    return request.defaults(defaults);
  }

  _createTagEntityPair(entity, tag, channels) {
    let tagEntityPair = {
      type: 'tag-entity-pairs',
      attributes: {
        type: isIP4r(entity) ? 'ip' : 'string',
        entity,
        tag,
        //confidence: get(this, 'selectedConfidence.value'),
        'channel-id': channels
      }
    };
    return tagEntityPair;
  }

  async _applyTags(tagEntityPairs) {
    return new Promise((resolve, reject) => {
      let requestOptions = {
        uri: `${this.host}/v2/tag-entity-pairs`,
        method: 'POST',
        body: { data: tagEntityPairs }
      };

      this.postmanRequest(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 201) {
          resolve(body);
        } else {
          this.logger.error('Error Applying Tags', { body, tagEntityPairs });
          reject({
            detail: 'Could not apply tags',
            status: response.statusCode,
            body: body,
            tagEntityPairs
          });
        }
      });
    });
  }
}

module.exports = Polarity;
