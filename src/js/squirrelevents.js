const electron = require("electron");
const path = require("path");
const fs = require("fs");
const childProcess = require("child_process");
const os = require("os");

// Define paths related to the app and its updates
const appExecutablePath = path.basename(process.execPath);
const updateExecutable = path.resolve(path.join(path.dirname(process.execPath), '..', "Update.exe"));

// Define paths for RoeLite data directories
const userHome = os.homedir();
const roeliteDir = path.join(userHome, ".roelite");
const appData = path.join(userHome, "AppData");
const localDataDir = path.join(appData, "Local", "RoeLite");
const roamingDataDir = path.join(appData, "Roaming", "RoeLite");
const startMenuShortcut = path.join("C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\RoeLite");

function handleSquirrelEvent() {
    if (process.argv.length === 1) {
        return false;
    }
    const squirrelEvent = process.argv[1];
    const isSquirrelEvent = squirrelEvent.startsWith('--squirrel');
    if (!isSquirrelEvent) return false;
    const executeUpdate = (args) => {
        try {
            return childProcess.spawn(updateExecutable, args, {detached: true});
        } catch (error) {
            console.error('Failed to spawn process:', error);
        }
    };
    const quit = () => setTimeout(electron.app.quit, 1000);
    switch (squirrelEvent) {
        case "--squirrel-install":
        case "--squirrel-updated":
            executeUpdate(["--createShortcut", appExecutablePath, "--shortcut-locations", "Desktop,StartMenu"]);
            quit();
            break;
        case "--squirrel-uninstall":
            executeUpdate(["--removeShortcut", appExecutablePath, "--shortcut-locations", "Desktop,StartMenu"]);
            [startMenuShortcut, localDataDir, roamingDataDir, roeliteDir].forEach(dir => {
                if (fs.existsSync(dir)) fs.rmdirSync(dir, {recursive: true, force: true});
            });
            quit();
            break;
        case "--squirrel-obsolete":
            quit();
            break;
    }
    return true;
}

module.exports = {handleSquirrelEvent};
