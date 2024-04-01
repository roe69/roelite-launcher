const https = require('https');

let checksums = {}; // Global variable to store checksums

function loadChecksums() {
    const options = {
        hostname: 'cloud2.roelite.net',
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

setInterval(loadChecksums, 5 * 60 * 1000);

function getChecksum(key) {
    return checksums[key] || null;
}

module.exports = {getChecksum, loadChecksums};