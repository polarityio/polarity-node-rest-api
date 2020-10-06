const Polarity = require('polarity-node-rest-api');
const polarity = new Polarity();

async function start() {
  await polarity.connect({
    host: 'https://my-polarity-server',
    username: 'username',
    password: 'password'
  });

  const channel = await polarity.createChannel('my-new-channel', 'this is a channel description');

  await polarity.disconnect();

  return channel;
}

start()
  .then((channel) => {
    console.info(channel);
  })
  .catch((err) => {
    console.error('Error uploading data', err);
  });
