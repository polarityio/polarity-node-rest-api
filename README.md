# Polarity Node REST API

![image](https://img.shields.io/badge/status-beta-green.svg)

This is a Node.js based helper library for working with the Polarity REST API.  The library simplifies working with the REST API when writing Node.js programs and can be used as the basis for various automation scripts. 

For samples please see the `samples` directory.

# Getting Started

In your package.json you can include this library directly from GitHub using the following:

```json
"dependencies": {
  "polarity-node-rest-api": "polarityio/polarity-node-rest-api"
}
```

Once you have the dependency included in your `package.json` require the dependency in your Node.js program

```javascript
const Polarity = require('polarity-node-rest-api');
```

You can construct a new Polarity instance using the `new` keyword.

```javascript
const polarity = new Polarity(Logger);
```

The constructor takes an optional [Winston](https://github.com/winstonjs/winston) logging object as a parameter.

Before any actions can be taken the Polarity instance must be connected to your server using the `connect` method.  The connect method and most methods in this library return a promise and support `async/await` syntax.

```javascript
await polarity.connect({
  host: 'https://your-polarity-server',
  username: 'username',
  password: 'password'
});
```

The following connection options are supported:

| Name          |  Description    |
| ------------- |  --------------- |
| `host`       |  Hostname including scheme (https://) of your Polarity server  |
| `username`      | Username for the account you want to authenticate as            |
| `password`      | Password for the provided `username`     |
| `request.rejectUnauthorized`  |  Defaults to true.  If set to `false`, the library will connect to untrusted/self-signed certificates               |
| `request.proxy` | An HTTP proxy to be used. |

Example:

```javascript
polarity.connect({
  host: 'https://your-polarity-server',
  username: 'username',
  password: 'password',
  request: {
    rejectUnauthorized: true,
    proxy: 'http://username:password@proxy.internal:8080'
});
```

Once connected, you can take the required action. For example, to restart an integration:

```javascript
await polarity.restartIntegration(integrationId);
```

Finally, you should `disconnect` from the server when you are done.

```javascript
await polarity.disconnect();
```


