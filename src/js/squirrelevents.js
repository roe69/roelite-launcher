const { app } = require("electron");
const path = require("path");
const fs = require("fs");

function handleSquirrelEvent() {
  if (process.argv.length === 1) {
    return false;
  }

  const ChildProcess = require("child_process");
  const path = require("path");

  const appFolder = path.resolve(process.execPath, "..");
  const rootAtomFolder = path.resolve(appFolder, "..");
  const updateDotExe = path.resolve(path.join(rootAtomFolder, "Update.exe"));
  const exeName = path.basename(process.execPath);

  const spawn = function (command, args) {
    let spawnedProcess, error;

    try {
      spawnedProcess = ChildProcess.spawn(command, args, { detached: true });
    } catch (error) {}

    return spawnedProcess;
  };

  const spawnUpdate = function (args) {
    return spawn(updateDotExe, args);
  };

  const squirrelEvent = process.argv[1];
  switch (squirrelEvent) {
    case "--squirrel-install":
    case "--squirrel-updated":
      // Optionally do things such as:
      // - Add your .exe to the PATH
      // - Write to the registry for things like file associations and
      //   explorer context menus

      // Install desktop and start menu shortcuts
      spawnUpdate([
        "--createShortcut",
        exeName,
        "--shortcut-locations",
        "Desktop,StartMenu",
      ]);

      setTimeout(app.quit, 1000);
      return true;

    case "--squirrel-uninstall":
      // Undo anything you did in the --squirrel-install and
      // --squirrel-updated handlers

      // Remove desktop and start menu shortcuts
      spawnUpdate([
        "--removeShortcut",
        exeName,
        "--shortcut-locations",
        "Desktop,StartMenu",
      ]);
      // Delete the RoeLite folder from the Start Menu Programs
      const shortcutPath = path.join(
        "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\RoeLite"
      );
      const dataPath = path.join(os.homedir(), "AppData", "Local", "RoeLite");
      const dataPath2 = path.join(
        os.homedir(),
        "AppData",
        "Roaming",
        "RoeLite"
      );
      // Check if directory exists and delete
      if (fs.existsSync(shortcutPath)) {
        fs.rmdirSync(shortcutPath, { recursive: true, force: true });
      }
      if (fs.existsSync(dataPath)) {
        fs.rmdirSync(dataPath, { recursive: true, force: true });
      }
      if (fs.existsSync(dataPath2)) {
        fs.rmdirSync(dataPath2, { recursive: true, force: true });
      }
      if (fs.existsSync(roeliteDir)) {
        fs.rmdirSync(roeliteDir, { recursive: true, force: true });
      }
      setTimeout(app.quit, 1000);
      return true;

    case "--squirrel-obsolete":
      // This is called on the outgoing version of your app before
      // we update to the new version - it's the opposite of
      // --squirrel-updated

      app.quit();
      return true;
  }
}

module.exports = { handleSquirrelEvent };
