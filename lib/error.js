function toError(detail, error, additionalProperties = {}) {
  const errorObj = {};
  if (error.stack) {
    errorObj.stack = error.stack;
  }

  if (error.inner) {
    errorObj.inner = error.inner;
  }

  if (error.message) {
    errorObj.message = error.message;
  }

  error.detail = detail;

  const props = Object.keys(additionalProperties);
  for (let i = 0; i < props.length; i++) {
    const key = props[i];
    const value = additionalProperties[key];
    errorObj[key] = value;
  }

  return errorObj;
}

module.exports = {
  toError
};
