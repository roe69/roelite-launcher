const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

let checksums = {}; // Global variable to store checksums

function loadChecksums() {
    const options = {
        hostname: 'cloud.roelite.net',
        port: 443,
        path: '/files/download',
        method: 'GET',
        headers: {
            'branch': "dev",
            'filename': "checksums.json",
        },
        rejectUnauthorized: false,
    };
    const request = https.get(options, function (response) {
        if (response.statusCode === 200) {
            let rawData = '';
            response.on('data', (chunk) => {
                rawData += chunk;
            });
            response.on('end', () => {
                try {
                    checksums = JSON.parse(rawData);
                    console.log("Checksums loaded into memory.");
                    console.log(JSON.stringify(checksums));
                } catch (e) {
                    console.error("Failed to parse checksums:", e.message);
                }
            });
        } else {
            console.error(`Failed to download checksums.json: Server responded with status code ${response.statusCode}`);
        }
    });
    request.on('error', function (e) {
        console.error(`Problem with request: ${e.message}`);
    });
}

function getChecksum(key) {
    console.log("Getting checksum for", key);
    return checksums[key] || null;
}

async function getFileChecksum(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('MD5');
            const stream = fs.createReadStream(filePath);
            stream.on('data', function (data) {
                hash.update(data);
            });
            stream.on('end', function () {
                resolve(hash.digest('hex'));
            });
            stream.on('error', function (err) {
                reject(err);
            });
        });
    } catch (err) {
        // If the file does not exist or is not readable, return null
        console.error("File does not exist or cannot be read:", filePath);
        return null;
    }
}

module.exports = {getChecksum, loadChecksums, getFileChecksum};