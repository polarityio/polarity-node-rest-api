const Polarity = require('polarity-node-rest-api');
const polarity = new Polarity();

async function start() {
  await polarity.connect({
    host: 'https://my-polarity-server',
    username: 'username',
    password: 'password'
  });

  const integrations = await polarity.getIntegrations();

  // Return the integration ID (name) and the entity types it supports including custom types
  const summary = integrations.data.map((integration) => {
    const entityTypes = integration.attributes['entity-types'];
    const customTypes = integration.attributes['custom-types'];
    const description = integration.attributes.description;
    return {
      id: integration.id,
      description,
      entityTypes: entityTypes.concat(
        customTypes.map((type) => {
          return type.key;
        })
      )
    };
  });

  await polarity.disconnect();

  return summary;
}

start()
  .then((summary) => {
    console.info(summary);
  })
  .catch((err) => {
    console.error('Error uploading data', err);
  });
