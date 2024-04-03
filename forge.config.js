module.exports = {
    packagerConfig: {
        asar: true,
        icon: "./src/img/icons/RoeLite",
    },
    makers: [
        {
            name: "@electron-forge/maker-squirrel",
            config: {
                name: "RoeLite",
                description: "Third party client for Oldschool Runescape and RSPS.",
                authors: "Roe",
                exe: "RoeLite.exe",
                loadingGif: "./src/img/icons/loading.gif",
                iconUrl: "https://roelite.net/favicon.ico",
                noMsi: true,
                remoteReleases: "",
                shortcutName: "RoeLite",
                title: "RoeLite",
                setupExe: "RoeLiteInstaller.exe",
                setupIcon: "./src/img/icons/RoeLite.ico",
                skipUpdateIcon: true,
            }
        }
    ]
};
