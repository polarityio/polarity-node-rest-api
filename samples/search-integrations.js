const Polarity = require('polarity-node-rest-api');
const polarity = new Polarity();

async function start() {
  // Array of integrationIds to search (use the helpers/getIntegrationId()) to convert a directory name
  // to an integration Id.
  const integrationsToSearch = ['virustotal', 'abuseipdb', 'arin'];
  // Text to parse entities from and search (up to 5,000 characters)
  const textToSearch = '8.8.8.8 8.8.4.4 google.com';
  // Don't stop on errors and log them to result object instead
  const ignoreErrors = true;

  await polarity.connect({
    host: 'https://my-polarity-server',
    username: 'username',
    password: 'password'
  });

  const lookupResults = await polarity.searchIntegrations(integrationsToSearch, textToSearch, ignoreErrors);

  await polarity.disconnect();

  return lookupResults;
}

start()
  .then((lookupResults) => {
    console.info(lookupResults, 'Successfully ran integration search');
  })
  .catch((err) => {
    console.error('Error running search', err);
  });
