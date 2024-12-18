let Polarity;
try {
  // If testing as a package, use module name 
  Polarity = require('polarity-node-rest-api');
} catch (err) {
  // Couldn't find module name, use local relative path
  Polarity = require('../../lib/polarity-v5');
}


const polarity = new Polarity();

async function start() {
  await polarity.connect({
    host: process.env.POLARITY_REST_HOST || 'https://my-polarity-server',
    username: process.env.POLARITY_REST_USERNAME || 'username',
    password: process.env.POLARITY_REST_PASSWORD || 'password',
    request: {
      rejectUnauthorized: false
    }
  });

  const parsedEntities = await polarity.parseEntities('8.8.8.8 is a Google DNS server');

  await polarity.disconnect();

  return parsedEntities;
}

start()
  .then((results) => {
    console.info(JSON.stringify(results, null, 2));
  })
  .catch((err) => {
    console.error('Error parsing entities', err);
  });
