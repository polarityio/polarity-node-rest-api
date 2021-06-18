const Polarity = require('polarity-node-rest-api');
const polarity = new Polarity();

async function start() {
  await polarity.connect({
    host: 'https://my-polarity-server',
    username: 'username',
    password: 'password'
  });

  const users = await polarity.getUsers();

  // Return the user id, username, and email
  const userSummary = users.data.map((user) => {
    const id = user.id;
    const username = user.attributes.username;
    const email = user.attributes.email;
    return {
      id,
      username,
      email
    };
  });

  await polarity.disconnect();

  return userSummary;
}

start()
  .then((userSummary) => {
    console.info(userSummary);
  })
  .catch((err) => {
    console.error('Error fetching users', err);
  });
