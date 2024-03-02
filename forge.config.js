const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: "./src/icons/roelite",
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "roelite",
        description: "Third party client for Oldschool Runescape and RSPS.",
        authors: "Roe",
        exe: "RoeLite.exe",
        loadingGif: "./src/icons/loading.gif",
        iconUrl: "https://roelite.net/favicon.ico",
        noMsi: true,
        remoteReleases: "",
        shortcutName: "RoeLite",
        title: "RoeLite",
        setupExe: "RoeLiteInstaller.exe",
        setupIcon: "./src/icons/roelite.ico",
        skipUpdateIcon: true,
      }
    }
  ]
};
