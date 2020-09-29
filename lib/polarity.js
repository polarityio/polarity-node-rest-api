const async = require('async');
const request = require('request');
const fs = require('fs');
const winston = require('winston');
const polarityValidator = require('polarity-validator');

/**
 * Accepts a Winston logging object.  If none is provided and `NODE_ENV` is set
 * to `development` the library will log to the console.  If `NODE_ENV` is not
 * set to `development` then the library will not output any logging
 */
class Polarity {
  constructor(log) {
    this.request = null;
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
  isDisconnected() {
    return !this.isConnected;
  }
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

      this.request(requestOptions, (err, response, body) => {
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
  async connect(connectOptions) {
    let self = this;

    this.request = this._createDefaultRequest(connectOptions);

    let requestOptions = {
      uri: `${connectOptions.host}/v1/authenticate`,
      method: 'POST',
      body: {
        identification: connectOptions.username,
        password: connectOptions.password
      }
    };

    return new Promise((resolve, reject) => {
      this.request(requestOptions, (err, response, body) => {
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
   * Returns the channel id of the request channel
   *
   * @param channelName the name of the channel to return an ID for.  Channel name is case sensitive.
   * @returns {Promise<unknown>} Returns the channel id for the requested channel name
   */
  async getChannelId(requestedChannelName) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to get a channel id' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/channels`,
        qs: {
          'filter[channel.channel-name]': requestedChannelName
        },
        method: 'GET'
      };

      this.request(requestOptions, (err, response, body) => {
        if (err) {
          this.logger.error(err);
          return reject({
            detail: 'HTTP Request Error',
            err: err
          });
        }

        if (response.statusCode === 200) {
          const channel = body.data.find((channel) => {
            return channel.attributes['channel-name'] === requestedChannelName;
          });

          if (channel) {
            resolve(channel.id);
          } else {
            this.logger.error('Error getting channel id', { body });
            reject({
              detail: `Unable to find channel named ${requestedChannelName}`,
              status: response.statusCode,
              body: body
            });
          }
        } else {
          this.logger.error('Error retrieving channel id', { body });
          reject({
            detail: 'Failed to get channel ID',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  async clearChannelByName(channelName) {
    return new Promise(async (resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to clear a channel by name' });
      }

      try {
        const channelId = await this.getChannelId(channelName);
        this.logger.debug(`clearChannelByName(): Channel name ${channelName} has channel id ${channelId}`);
        resolve(await this.clearChannel(channelId));
      } catch (clearChannelError) {
        reject(clearChannelError);
      }
    });
  }

  async clearChannel(channelId) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to clear a channel' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/channels/${channelId}?option[clearChannel]=true`,
        method: 'DELETE'
      };

      return this.request(requestOptions, (err, response, body) => {
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

      this.request(requestOptions, (err, response, body) => {
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

  async restartIntegration(integrationId) {
    return new Promise((resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to restart an integration' });
      }

      const requestOptions = {
        uri: `${this.host}/v2/integrations/${integrationId}/restart`,
        method: 'GET'
      };

      this.request(requestOptions, (err, response, body) => {
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

  async applyTags(rows, channelId) {
    return new Promise(async (resolve, reject) => {
      if (this.isDisconnected()) {
        return reject({ detail: 'Polarity must be connected before trying to getTagsByEntityValue()' });
      }

      try {
        const MAX_TAG_ENTITIES_PER_REQUEST = 2000;
        let uploadResult;
        let data = [];
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
          let row = rows[rowIndex];
          let entity = row[0];
          for (let columnIndex = 1; columnIndex < row.length; columnIndex++) {
            data.push(this._createTagEntityPair(entity, row[columnIndex], [channelId]));
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
        reject(e);
      }
    });
  }

  async _applyTags(tagEntityPairs) {
    return new Promise((resolve, reject) => {
      let requestOptions = {
        uri: `${this.host}/v2/tag-entity-pairs`,
        method: 'POST',
        body: { data: tagEntityPairs }
      };

      this.request(requestOptions, (err, response, body) => {
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
          this.logger.error('Error Applying Tags', { body });
          reject({
            detail: 'Could not apply tags',
            status: response.statusCode,
            body: body
          });
        }
      });
    });
  }

  _createTagEntityPair(entity, tag, channels) {
    let tagEntityPair = {
      type: 'tag-entity-pairs',
      attributes: {
        type: polarityValidator.validator.isIP4r(entity) ? 'ip' : 'string',
        entity,
        tag,
        //confidence: get(this, 'selectedConfidence.value'),
        'channel-id': channels
      }
    };
    return tagEntityPair;
  }

  _isAuthenticated() {}

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
  //   this.request(requestOptions, function(err, response, body) {
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

    this.request(requestOptions, function (err, response, body) {
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

    this.request(requestOptions, function (err, response, body) {
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
}

module.exports = Polarity;
