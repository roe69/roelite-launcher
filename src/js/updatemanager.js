const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");
const log = require("electron-log");
const semver = require("semver");
const https = require("https");
const os = require("os");
const roeliteDir = path.join(os.homedir(), ".roelite");
const localVersionPath = path.join(roeliteDir, ".launcherversion");
const exec = require("child_process").exec;

async function getRemoteVersion() {
  return new Promise((resolve, reject) => {
    const versionUrl =
      "https://www.dropbox.com/scl/fi/6a0udocnjvq8nfmvl838u/version.txt?rlkey=ylxiy8ot8479bitl7lyjlisyq&dl=1";

    https
      .get(versionUrl, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const matches = data.match(/https:\/\/[^\s]+?dl=1/);
          if (matches) {
            const directLink = matches[0];
            https.get(directLink, (versionRes) => {
              let versionData = "";
              versionRes.on("data", (versionChunk) => {
                versionData += versionChunk;
              });
              versionRes.on("end", () => {
                const remoteVersion = versionData.trim();
                log.info("Remote version retrieved: " + remoteVersion);
                resolve(remoteVersion);
              });
            });
          } else {
            log.error(
              "Could not extract the direct link from the Dropbox response."
            );
            reject(new Error("Failed to extract direct download link."));
          }
        });
      })
      .on("error", (err) => {
        log.error("Error checking for updates:", err);
        reject(err);
      });
  });
}

async function checkForUpdates(mainWindow) {
  try {
    const remoteVersion = await getRemoteVersion();
    if (!fs.existsSync(localVersionPath)) {
      // Write the remote version to the local version file
      fs.writeFileSync(localVersionPath, remoteVersion);
    }
    let launcherVersion = fs.readFileSync(localVersionPath, "utf-8").trim();
    log.info("Local: " + launcherVersion);
    if (
      semver.valid(remoteVersion) &&
      semver.gt(remoteVersion, launcherVersion)
    ) {
      log.info(`Update available: ${launcherVersion} -> ${remoteVersion}`);
      downloadAndUpdate(remoteVersion);
    } else {
      fs.unlink(path.join(roeliteDir, "RoeLiteInstaller.exe"), (err) => {});
      log.info("No updates found or already up to date.");
      const javaVersion = "n/a";
      mainWindow.webContents.send("versionInfo", {
        javaVersion,
        launcherVersion,
      });
    }
  } catch (error) {
    log.error("Failed to check for updates:", error);
  }
}

function createProgressWindow() {
  let progressWin = new BrowserWindow({
    icon: path.join(__dirname, "../icons/roelite.ico"),
    width: 500,
    height: 100,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  progressWin.setAlwaysOnTop(true);
  progressWin.setResizable(false);
  progressWin.setFullScreenable(false);
  progressWin.setMinimizable(false);
  progressWin.setClosable(false);
  progressWin.setMaximizable(false);
  progressWin.setMenuBarVisibility(false);
  progressWin.loadFile(path.join(__dirname, "progress.html"));
  return progressWin;
}

function downloadAndUpdate(remoteVersion) {
  const updateExePath = path.join(roeliteDir, "RoeLiteInstaller.exe");
  const updateUrl =
    "https://www.dropbox.com/scl/fi/va6tz1r8o2p8e03wt9kho/RoeLiteInstaller.exe?rlkey=34zo13iuyno3c5aolr785c0q8&dl=1";

  let progressWin = createProgressWindow();

  // Function to update the progress window
  function updateProgressDialog(progress, message) {
    progressWin.webContents.send("update-progress", { progress, message });
  }
  updateProgressDialog(0, "Update available");
  var updatedLocal = false;
  https
    .get(updateUrl, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        const matches = data.match(/https:\/\/[^\s]+?dl=1/);
        if (matches && matches[0]) {
          const directDownloadUrl = matches[0];
          const fileStream = fs.createWriteStream(updateExePath);
          https.get(directDownloadUrl, (downloadResponse) => {
            let downloadedBytes = 0;
            const totalBytes = parseInt(
              downloadResponse.headers["content-length"],
              10
            );
            downloadResponse.on("data", (chunk) => {
              downloadedBytes += chunk.length;
              const progressPercentage = (downloadedBytes / totalBytes) * 100;
              updateProgressDialog(
                progressPercentage,
                `Downloading update: ${Math.round(progressPercentage)}%`
              );
              if (progressPercentage > 98.0) {
                if (!updatedLocal){
                  updatedLocal = true;
                  fs.writeFileSync(localVersionPath, remoteVersion);
                }
                updateProgressDialog(100, "Restarting...");
              } else if (progressPercentage > 94.0) {
                updateProgressDialog(94, "Update downloaded, applying...");
              }
            });

            downloadResponse.pipe(fileStream);

            fileStream.on("finish", () => {
              fs.writeFileSync(localVersionPath, remoteVersion);
              progressWin.setClosable(true);
              fileStream.close();
              log.info("Update downloaded, starting the update process...");
              exec(updateExePath, (error) => {
                if (error) {
                  log.error(`Error executing update: ${error}`);
                }
                app.quit(); // Quit the app to allow the installer to run
              });
            });
          });
        } else {
          log.error("Could not extract the direct download URL.");
        }
      });
    })
    .on("error", (err) => {
      log.error(`Error downloading update: ${err}`);
    });
}

module.exports = { checkForUpdates };
