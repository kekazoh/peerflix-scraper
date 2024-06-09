import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'readline';
import { strict as assert } from 'assert';

const apiId = process.env.TELEGRAM_APP_ID;
const apiHash = process.env.TELEGRAM_API_KEY;
// eslint-disable-next-line max-len
const stringSession = new StringSession(''); // fill this later with the value from session.save()

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

(async (): Promise<void> => {
  console.log('Loading interactive example...');
  assert(apiId && apiHash, 'TELEGRAM_APP_ID && TELEGRAM_API_KEY are required');
  const client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
    connectionRetries: 5,
  });
  await client.start({
    phoneNumber: async () =>
      new Promise((resolve) =>
        rl.question('Please enter your number: ', resolve),
      ),
    password: async () =>
      new Promise((resolve) =>
        rl.question('Please enter your password: ', resolve),
      ),
    phoneCode: async () =>
      new Promise((resolve) =>
        rl.question('Please enter the code you received: ', resolve),
      ),
    onError: (err) => console.log(err),
  });
  console.log('You should now be connected.');
  console.log('Session', client.session.save()); // Save this string to avoid logging in again
  await client.sendMessage('me', { message: `Your new session has been saved at ${new Date().toISOString()}` });
})();