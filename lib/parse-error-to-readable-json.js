const parseErrorToReadableJson = (error) =>
    JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));

module.exports = parseErrorToReadableJson;