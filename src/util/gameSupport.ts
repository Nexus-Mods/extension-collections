const gameSupport = {
    skyrim: {
        gameSettingsFiles: ['Skyrim.ini', 'SkyrimPrefs.ini'],
    },
    skyrimse: {
        gameSettingsFiles: ['Skyrim.ini', 'SkyrimPrefs.ini'],
    },
    skyrimvr: {
        gameSettingsFiles: ['Skyrim.ini', 'SkyrimPrefs.ini'],
    },
    fallout3: {
        gameSettingsFiles: ['Fallout.ini'],
    },
    fallout4: {
        gameSettingsFiles: ['Fallout4.ini', 'Fallout4Prefs.ini'],
    },
    fallout4vr: {
        gameSettingsFiles: ['Fallout4Custom.ini', 'Fallout4Prefs.ini'],
    },
    falloutnv: {
        gameSettingsFiles: ['Fallout.ini', 'FalloutPrefs.ini'],
    },
    oblivion: {
        gameSettingsFiles: ['Oblivion.ini'],
    },
};

export function getIniFiles(gameId: string): string[] {
  if (gameSupport[gameId] === undefined) {
    return [];
  } else {
    return gameSupport[gameId].gameSettingsFiles || [];
  }
}
