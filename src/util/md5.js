const fs = require('fs');
const crypto = require('crypto');

function getFileChecksum(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('MD5');
        const stream = fs.createReadStream(filePath);

        stream.on('data', function (data) {
            hash.update(data, 'utf8');
        });

        stream.on('end', function () {
            resolve(hash.digest('hex'));
        });

        stream.on('error', function (err) {
            reject(err);
        });
    });
}

module.exports = {getFileChecksum};