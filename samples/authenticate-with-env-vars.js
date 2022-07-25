const Polarity = require('polarity-node-rest-api');
const polarity = new Polarity();

async function start() {
  await polarity.connect({
    host: process.env.POLARITY_HOST,
    username: process.env.POLARITY_USERNAME,
    password: process.env.POLARITY_PASSWORD
  });

  await polarity.disconnect();
}

start()
  .then(() => {
    console.info('Successfully authenticated to and disconnected from server');
  })
  .catch((err) => {
    console.error('Error authenticating to server', err);
  });
