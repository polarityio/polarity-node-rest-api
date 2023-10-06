const Polarity = require('../lib/polarity');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.json(),
  defaultMeta: { service: 'polarity' },
  transports: [new winston.transports.Console()]
});

const polarity = new Polarity(logger);

async function getUsersForIntegration(integrationId) {
  await polarity.connect({
    host: 'https://polarity.server',
    username: 'user',
    password: 'password',
    request: {
      rejectUnauthorized: false
    }
  });

  const users = await polarity.getUsersForIntegration('integration-name');

  await polarity.disconnect();
  return users;
}

getUsersForIntegration('arin')
  .then((result) => {
    let usernames = result.reduce((users, user) => {
      if (user.attributes.enabled) {
        users.push(user.attributes.username);
      }
      return users;
    }, []);
    console.log(usernames);
  })
  .catch((err) => {
    console.error('Error getting users for integration', { err });
  });
