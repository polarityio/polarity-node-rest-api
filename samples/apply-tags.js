const Polarity = require('polarity-node-rest-api');
const polarity = new Polarity();

async function start() {
  await polarity.connect({
    host: 'https://my-polarity-server',
    username: 'username',
    password: 'password'
  });

  const channel = await polarity.getChannel('my-channel');

  const results = await polarity.applyTags(
    [
      ['entity-1', 'tag-1'],
      ['entity-2', 'tag-2'],
      ['entity-3', 'tag-3']
    ],
    channel.id
  );

  await polarity.disconnect();

  return results;
}

start()
  .then((results) => {
    console.info(results);
  })
  .catch((err) => {
    console.error('Error uploading data', err);
  });
