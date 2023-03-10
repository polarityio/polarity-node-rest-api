const Polarity = require('polarity-node-rest-api');
const polarity = new Polarity();

async function start() {
  const integrationId = 'aws_ec2';
  const optionKey = 'accessKeyId';
  const optionAttributes = {
    value: 'my-access-key-id',
    'admin-only': true,
    'user-can-edit': false
  };

  await polarity.connect({
    host: 'https://my-polarity-server',
    username: 'username',
    password: 'password'
  });

  await polarity.updateIntegrationOption(integrationId, optionKey, optionAttributes);

  await polarity.disconnect();
}

start()
  .then(() => {
    console.info('Option updated');
  })
  .catch((err) => {
    console.error('Error updating option', err);
  });
