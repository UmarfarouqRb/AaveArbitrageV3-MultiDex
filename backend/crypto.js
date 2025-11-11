const crypto = require('crypto');

const ALGORITHM = 'aes-256-ctr';
const IV_LENGTH = 16;

function decrypt(encryptedData, password) {
    const textParts = encryptedData.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const key = crypto.createHash('sha256').update(String(password)).digest('base64').substr(0, 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = { decrypt };
