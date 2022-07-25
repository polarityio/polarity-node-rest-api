const Polarity = require('polarity-node-rest-api');
const polarity = new Polarity();

async function start() {
  const integrationDirectoryName = 'integration-directory-name';

  await polarity.connect({
    host: 'https://my-polarity-server',
    username: 'username',
    password: 'password'
  });

  await polarity.restartIntegration(integrationDirectoryName);

  await polarity.disconnect();
}

start()
  .then(() => {
    console.info('Successfully restarted the integration');
  })
  .catch((err) => {
    console.error('Error restarting integration', err);
  });
