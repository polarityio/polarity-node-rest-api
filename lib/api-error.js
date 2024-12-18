const parseErrorToReadableJson = require('./parse-error-to-readable-json');

/**
 * Native errors contain the following properties:
 * cause
 * code
 * message
 * stack
 * https://nodejs.org/dist/latest-v18.x/docs/api/errors.html#class-error
 */
class ApiError extends Error {
  /**
   * Construct a new IntegrationError object.
   * @param message {string} - A string description of the error which is used as the `detail` property on the
   * serialized error.
   * @param properties {Object} - Optional properties for the error.  There are two special properties which have special
   * handling:
   *
   * {Error | string | Object} cause - The `cause` property is used to specify the `cause` of the error.  Typically,
   * this property is used to pass through a related Error instance.
   * https://nodejs.org/dist/latest-v18.x/docs/api/errors.html#errorcause
   *
   * {Object} requestOptions - Relevant for integration errors involving a network call, the `requestOptions` property
   * details the request options that resulted in the specified error.  The `requestOptions` property will automatically
   * have sensitive authentication headers stripped.
   */
  constructor(message = '', properties = {}) {
    super(message);
    // These are enumerable properties which the Polarity server can access
    // Most important is the `detail` property which is used to display
    // a user-friendly message in the Overlay Window.
    this.detail = message;
    this.name = this.constructor.name;

    if (typeof properties.statusCode !== undefined) {
      this.statusCode = properties.statusCode;
    }

    this.meta = {
      ...properties
    };

    if (properties.cause instanceof Error) {
      this.meta.cause = parseErrorToReadableJson(properties.cause);
    }

    if (properties.requestOptions) {
      this.meta.requestOptions = this.sanitizeRequestOptions(properties.requestOptions);
    }
  }

  /**
   * Given a postman-request options object, will return a sanitized object with basic auth and Authorization headers
   * removed.
   *
   * TODO: Come up with a more robust way to detect secrets and obscure them
   *
   * @param requestOptions
   * @returns {*}
   */
  sanitizeRequestOptions(requestOptions) {
    const sanitizedOptions = {
      ...requestOptions
    };

    if (sanitizedOptions.headers && sanitizedOptions.headers.Authorization) {
      sanitizedOptions.headers.Authorization = '**********';
    }

    if (sanitizedOptions.headers && sanitizedOptions.headers['x-api-key']) {
      sanitizedOptions.headers['x-api-key'] = '**********';
    }

    if (sanitizedOptions.auth && sanitizedOptions.auth.password) {
      sanitizedOptions.auth.password = '**********';
    }

    if (sanitizedOptions.auth && sanitizedOptions.auth.bearer) {
      sanitizedOptions.auth.bearer = '**********';
    }

    if (requestOptions.body && requestOptions.body.password) {
      requestOptions.body.password = '**********';
    }

    if (requestOptions.form && requestOptions.form.client_secret) {
      requestOptions.form.client_secret = '**********';
    }

    return sanitizedOptions;
  }
}

// https://stackoverflow.com/a/18391400/2853094
if (!('toJSON' in ApiError.prototype))
  Object.defineProperty(ApiError.prototype, 'toJSON', {
    value: function () {
      let alt = {};

      Object.getOwnPropertyNames(this).forEach(function (key) {
        alt[key] = this[key];
      }, this);

      return alt;
    },
    configurable: true,
    writable: true
  });

module.exports = ApiError;