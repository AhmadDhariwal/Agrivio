const net = require('node:net');
const tls = require('node:tls');

function encodeDotStuff(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

/**
 * Reads SMTP response lines from a buffered stream, resolving with the final
 * status code and text when the server completes a response.
 *
 * Handles both single-line (e.g. "220 Ready") and multi-line
 * (e.g. "250-SIZE ...\r\n250 OK") SMTP responses correctly.
 *
 * Returns a Promise that resolves to { code, text } or rejects on 4xx/5xx.
 */
function readSmtpResponse(socket) {
  return new Promise((resolve, reject) => {
    let buf = '';

    function onData(chunk) {
      buf += chunk;
      const lines = buf.split('\r\n');
      // Keep incomplete last line in buffer
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (line === '') continue;
        // SMTP continuation: "250-..." means more lines follow
        if (/^\d{3}-/.test(line)) continue;
        // Final line of this response: "250 ..." or "220 ..."
        if (/^\d{3}[\s]/.test(line) || /^\d{3}$/.test(line)) {
          socket.removeListener('data', onData);
          socket.removeListener('error', onError);
          const code = Number(line.slice(0, 3));
          if (code >= 400) {
            reject(new Error(`SMTP error ${code}: ${line.slice(4).trim()}`));
          } else {
            resolve({ code, text: line.slice(4).trim(), fullLine: line });
          }
          return;
        }
      }
    }

    function onError(err) {
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      reject(err);
    }

    socket.on('data', onData);
    socket.on('error', onError);
  });
}

/**
 * Sends one SMTP command and waits for the server response.
 * Resolves with { code, text } or rejects on 4xx/5xx or network error.
 */
function sendCommand(socket, line) {
  const responsePromise = readSmtpResponse(socket);
  socket.write(`${line}\r\n`);
  return responsePromise;
}

/**
 * Minimal SMTP client that supports:
 *   - Implicit TLS (smtpSecure=true, port 465)
 *   - STARTTLS upgrade (smtpSecure=false, port 587)
 *   - AUTH LOGIN with base64 username/password
 *   - Plain unauthenticated relay (no credentials)
 */
async function smtpSend({ host, port, secure, username, password, from, message }) {
  // Step 1: open TCP socket (or TLS for port 465)
  const rawSocket = await new Promise((resolve, reject) => {
    const s = secure
      ? tls.connect({ host, port, servername: host }, () => resolve(s))
      : net.connect({ host, port }, () => resolve(s));
    s.once('error', reject);
  });

  rawSocket.setEncoding('utf8');

  // Wrap so we can replace the socket reference after STARTTLS
  let socket = rawSocket;

  try {
    // Step 2: read server greeting (220)
    await readSmtpResponse(socket);

    // Step 3: EHLO
    const ehloResp = await sendCommand(socket, 'EHLO agrivio');
    if (ehloResp.code !== 250) {
      throw new Error(`EHLO rejected: ${ehloResp.code}`);
    }

    // Step 4: STARTTLS upgrade when not already using implicit TLS
    if (!secure) {
      await sendCommand(socket, 'STARTTLS');
      // Upgrade the raw TCP socket to TLS in-place
      socket = await new Promise((resolve, reject) => {
        const tlsSocket = tls.connect(
          { socket: rawSocket, host, servername: host },
          () => resolve(tlsSocket),
        );
        tlsSocket.once('error', reject);
        tlsSocket.setEncoding('utf8');
      });
      // Re-EHLO over TLS as required by RFC 3207
      const ehlo2 = await sendCommand(socket, 'EHLO agrivio');
      if (ehlo2.code !== 250) {
        throw new Error(`EHLO (post-STARTTLS) rejected: ${ehlo2.code}`);
      }
    }

    // Step 5: AUTH LOGIN (only when credentials are provided)
    if (username && password) {
      await sendCommand(socket, 'AUTH LOGIN');
      await sendCommand(socket, Buffer.from(username).toString('base64'));
      await sendCommand(socket, Buffer.from(password).toString('base64'));
    }

    // Step 6: envelope
    await sendCommand(socket, `MAIL FROM:<${from}>`);
    await sendCommand(socket, `RCPT TO:<${message.to}>`);

    // Step 7: DATA
    await sendCommand(socket, 'DATA');

    // Step 8: send message body terminated by <CRLF>.<CRLF>
    const body = [
      `From: ${from}`,
      `To: ${message.to}`,
      `Subject: ${message.subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      encodeDotStuff(message.text),
      '.',
    ].join('\r\n');
    await new Promise((resolve, reject) => {
      // Listen for server 250 after the dot-terminator
      const responsePromise = readSmtpResponse(socket);
      socket.write(`${body}\r\n`);
      responsePromise.then(resolve, reject);
    });

    // Step 9: QUIT
    await sendCommand(socket, 'QUIT');
  } finally {
    socket.destroy();
    if (socket !== rawSocket) {
      rawSocket.destroy();
    }
  }
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
    await smtpSend({ host: host.trim(), port, secure, username, password, from, message });
    return { skipped: false };
  }

  return {
    enabled,
    publicWebBaseUrl,
    async sendPasswordReset({ email, token }) {
      const resetUrl = `${publicWebBaseUrl.replace(/\/$/, '')}/password-reset/confirm?token=${encodeURIComponent(token)}`;
      return sendMail({
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
