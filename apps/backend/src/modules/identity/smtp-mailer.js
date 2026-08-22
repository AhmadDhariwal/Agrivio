const net = require('node:net');
const tls = require('node:tls');

function encodeDotStuff(text) {
  return String(text).replace(/\r\n/g, '\n').split('\n').map((line) => (line.startsWith('.') ? `.${line}` : line)).join('\r\n');
}

function createSmtpMailTransport(config) {
  const host = config.smtpHost;
  const port = config.smtpPort;
  const secure = config.smtpSecure === true;
  const username = config.smtpUsername;
  const password = config.smtpPassword;
  const from = config.smtpFrom;
  const publicWebBaseUrl = config.publicWebBaseUrl;
  const enabled = typeof host === 'string' && host.trim() !== '';

  async function sendMail(message) {
    if (!enabled) {
      return { skipped: true };
    }
    await new Promise((resolve, reject) => {
      const socket = secure
        ? tls.connect({ host, port, servername: host })
        : net.connect({ host, port });
      let buffer = '';
      const commands = [];
      function send(line) {
        socket.write(`${line}\r\n`);
      }
      socket.setEncoding('utf8');
      socket.on('error', reject);
      socket.on('data', (chunk) => {
        buffer += chunk;
        if (!buffer.includes('\r\n')) {
          return;
        }
        const lines = buffer.split('\r\n');
        buffer = lines.pop() ?? '';
        const last = lines.filter((item) => item !== '').pop();
        if (last === undefined || !/^\d{3}[\s-]/.test(last)) {
          return;
        }
        const code = last.slice(0, 3);
        if (code.startsWith('4') || code.startsWith('5')) {
          socket.destroy();
          reject(new Error('SMTP delivery failed'));
          return;
        }
        const next = commands.shift();
        if (next === undefined) {
          socket.end();
          resolve();
          return;
        }
        next();
      });
      commands.push(
        () => send(`EHLO agrivio`),
        () => {
          if (username && password) {
            send('AUTH LOGIN');
          } else {
            send(`MAIL FROM:<${from}>`);
          }
        },
      );
      if (username && password) {
        commands.push(
          () => send(Buffer.from(username).toString('base64')),
          () => send(Buffer.from(password).toString('base64')),
          () => send(`MAIL FROM:<${from}>`),
        );
      }
      commands.push(
        () => send(`RCPT TO:<${message.to}>`),
        () => send('DATA'),
        () => {
          const body = [
            `From: ${from}`,
            `To: ${message.to}`,
            `Subject: ${message.subject}`,
            'Content-Type: text/plain; charset=utf-8',
            '',
            encodeDotStuff(message.text),
            '.',
          ].join('\r\n');
          socket.write(`${body}\r\n`);
        },
        () => send('QUIT'),
      );
    });
    return { skipped: false };
  }

  return {
    enabled,
    publicWebBaseUrl,
    async sendPasswordReset({ email, token }) {
      const resetUrl = `${publicWebBaseUrl.replace(/\/$/, '')}/password-reset/confirm?token=${encodeURIComponent(token)}`;
      await sendMail({
        to: email,
        subject: 'Agrivio password reset',
        text: `Use this link within 30 minutes to choose a new password:\n${resetUrl}\n\nIf you did not request this, you can ignore this message.`,
      });
    },
  };
}

module.exports = {
  createSmtpMailTransport,
};
