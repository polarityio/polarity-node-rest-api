/**
 * Takes an integration directory name and converts it into the integration id
 *
 * @param intDir
 * @returns {*}
 */
function getIntegrationId(intDir) {
  return intDir.replace(/([^0-9a-zA-Z])/g, '_');
}

module.exports = {
  getIntegrationId
}