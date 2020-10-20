const ipAddress = require('ip-address');

const MINIMUM_TAG_NAME_LENGTH = 1;
const MAXIMUM_TAG_NAME_LENGTH = 2100;

const MAXIMUM_ENTITY_NAME_LENGTH = 256;
const MINIMUM_ENTITY_NAME_LENGTH = 1;

/**
 * Returns undefined if the tag is valid, otherwise returns an error message
 * @param tag
 * @returns {string} Error message or undefined if the tag is valid
 */
function validateTag(tag) {
  if (tag.length < MINIMUM_TAG_NAME_LENGTH || tag.length > MAXIMUM_TAG_NAME_LENGTH) {
    return `The tag '${tag}' must be greater than or equal to ${MINIMUM_TAG_NAME_LENGTH} characters and less than or equal to ${MAXIMUM_TAG_NAME_LENGTH} characters`;
  }
}

/**
 * Returns undefined if the entity is valid, otherwise returns an error message
 * @param entity
 * @returns {string} Error message or undefined if the entity if valid
 */
function validateEntity(entity) {
  if (entity.length < MINIMUM_ENTITY_NAME_LENGTH || entity.length > MAXIMUM_ENTITY_NAME_LENGTH) {
    return `The entity '${entity}' must be greater than or equal to ${MINIMUM_ENTITY_NAME_LENGTH} characters and less than or equal to ${MAXIMUM_ENTITY_NAME_LENGTH} characters`;
  }
}

function _hasLeadingZero(value) {
  if (value.length > 1 && value[0] === '0') {
    return true;
  }

  return false;
}

function _isValidOctet(value) {
  for (var i = 0; i < value.length; i++) {
    const c = value[i];
    if (c < '0' || c > '9') {
      return false;
    }
  }

  return true;
}

function isIP4r(value) {
  if (isIP(value) || isIPCidr(value) || isIPRange(value)) {
    return true;
  } else {
    return false;
  }
}

/**
 * Returns true if the provided value is a valid IPv4 range or IPv6 range
 * @param value
 * @returns {boolean}
 * @private
 */
function isIPRange(value) {
  if (isIPv4Range(value) || isIPv6Range(value)) {
    return true;
  }
  return false;
}

function isIPv4Range(value) {
  value = value.trim();

  const ipAddresses = value.split('-');

  if (ipAddresses.length !== 2) {
    return false;
  }

  const startIp = ipAddresses[0].trim();
  const endIp = ipAddresses[1].trim();

  if (isIPv4(startIp) && isIPv4(endIp)) {
    return true;
  }

  return false;
}

function isIPv6Range(value) {
  value = value.trim();

  const ipAddresses = value.split('-');

  if (ipAddresses.length !== 2) {
    return false;
  }

  const startIp = ipAddresses[0].trim();
  const endIp = ipAddresses[1].trim();

  if (isIPv6(startIp) && isIPv6(endIp)) {
    return true;
  }

  return false;
}

/**
 * Returns true if the provided value is a valid IPv4 or IPv6 CIDR address
 * @param value
 * @returns {boolean}
 * @private
 */
function isIPCidr(value) {
  if (isIPv4Cidr(value) || isIPv6Cidr(value)) {
    return true;
  }

  return false;
}

function isIPv4Cidr(value) {
  if (value === null || value === undefined) {
    return false;
  }

  value = value.trim();

  const tokens = value.split('/');

  if (tokens.length !== 2) {
    return false;
  }

  const cidrBlock = parseInt(tokens[1], 10);
  const ip = tokens[0];

  if (cidrBlock === NaN || cidrBlock < 0 || cidrBlock > 32) {
    return false;
  }

  if (!isIPv4(ip)) {
    return false;
  }

  // Validate CIDR value
  // This logic is based off the table found on wikipedia here:
  // http://en.wikipedia.org/wiki/Classless_Inter-Domain_Routing
  const octets = ip.split('.');

  // Convert from string to float.  We know this is a valid IP so don't have to test
  const octet0 = +octets[0];
  const octet1 = +octets[1];
  const octet2 = +octets[2];
  const octet3 = +octets[3];

  if (cidrBlock <= 32 && cidrBlock >= 25) {
    let modulus = Math.pow(2, 32 - cidrBlock);
    if (octet3 % modulus === 0) {
      return true;
    }
  }

  if (cidrBlock <= 24 && cidrBlock >= 17) {
    let modulus = Math.pow(2, 24 - cidrBlock);
    if (octet3 === 0 && octet2 % modulus === 0) {
      return true;
    }
  }

  if (cidrBlock <= 16 && cidrBlock >= 9) {
    let modulus = Math.pow(2, 16 - cidrBlock);
    if (octet3 === 0 && octet2 === 0 && octet1 % modulus === 0) {
      return true;
    }
  }

  if (cidrBlock <= 8 && cidrBlock >= 1) {
    let modulus = Math.pow(2, 8 - cidrBlock);
    if (octet3 === 0 && octet2 === 0 && octet1 === 0 && octet0 % modulus === 0) {
      return true;
    }
  }

  if (cidrBlock === 0) {
    if (octet3 === 0 && octet2 === 0 && octet1 === 0 && octet0 === 0) {
      return true;
    }
  }

  return false;
}

function isIPv6Cidr(value) {
  if (value === null || value === undefined) {
    return false;
  }

  value = value.trim();

  const tokens = value.split('/');

  if (tokens.length !== 2) {
    return false;
  }

  const cidrBlock = parseInt(tokens[1], 10);
  const ip = tokens[0];

  if (cidrBlock === NaN || cidrBlock < 0 || cidrBlock > 128) {
    return false;
  }

  if (!isIPv6(ip)) {
    return false;
  }

  return true;
}

/**
 * Returns true if the value is a valid IPv4 or IPv6 value (not a range or CIDR).
 *
 * @param value
 * @returns {boolean}
 * @private
 */
function isIP(value) {
  if (isIPv4(value) || isIPv6(value)) {
    return true;
  }
  return false;
}

/**
 * Returns true for any ip address of the following form
 *
 * 0-255.0-255.0-255.0-255
 *
 * Does not accept leading zeroes so the following are invalid:
 *
 * 00.0.0.1
 * 100.01.2.3
 * etc.
 *
 * Does not accept a string with leading or trailing spaces as being an IP.
 *
 * For example, " 123.2.3.1" will not be considered valid.
 *
 * @param value
 * @returns {boolean}
 * @private
 */

const hasSpaceRegex = new RegExp(/\s/);
const hasPercentRegex = new RegExp(/%/);

function isIPv4(value) {
  if (value === null || value === undefined) {
    return false;
  }

  value = value.trim();

  if (hasSpaceRegex.test(value)) {
    return false;
  }

  const octets = value.split('.');

  if (octets.length !== 4) {
    return false;
  }

  // Prevents the invalid IP "123.2.3." from being
  // marked as valid.  When you split on the above, the length
  // will be 4 and the last octet will be equal to an empty string
  // This empty string then gets coerced into the integer value 0
  // This check prevents that from happening.
  for (let i = 0; i < octets.length; i++) {
    if (octets[i] === undefined || octets[i] === null || octets[i] === '') {
      return false;
    }
  }

  if (
    !_isValidOctet(octets[0]) ||
    !_isValidOctet(octets[1]) ||
    !_isValidOctet(octets[2]) ||
    !_isValidOctet(octets[3])
  ) {
    return false;
  }

  if (
    _hasLeadingZero(octets[0]) ||
    _hasLeadingZero(octets[1]) ||
    _hasLeadingZero(octets[2]) ||
    _hasLeadingZero(octets[3])
  ) {
    return false;
  }

  // Convert from string to float then test to see if conversion worked
  const octet0 = +octets[0];
  const octet1 = +octets[1];
  const octet2 = +octets[2];
  const octet3 = +octets[3];

  if (isNaN(octet0) || isNaN(octet1) || isNaN(octet2) || isNaN(octet3)) {
    return false;
  }

  if (
    octet0 < 0 ||
    octet0 > 255 ||
    octet1 < 0 ||
    octet1 > 255 ||
    octet2 < 0 ||
    octet2 > 255 ||
    octet3 < 0 ||
    octet3 > 255
  ) {
    return false;
  }

  return true;
}

function isIPv6(value) {
  if (value === null || value === undefined) {
    return false;
  }

  value = value.trim();

  if (hasSpaceRegex.test(value) || hasPercentRegex.test(value)) {
    return false;
  }

  const address = new ipAddress.Address6(value);

  return address.isValid();
}

module.exports = {
  isIP4r,
  validateEntity,
  validateTag
};
