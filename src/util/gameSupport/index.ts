import * as gamebryo from './gamebryo';

import { types } from 'vortex-api';
import { ICollection } from '../../types/ICollection';

const gameSupport = {
    skyrim: {
        gameSettingsFiles: ['Skyrim.ini', 'SkyrimPrefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
    },
    skyrimse: {
        gameSettingsFiles: ['Skyrim.ini', 'SkyrimPrefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
    },
    skyrimvr: {
        gameSettingsFiles: ['Skyrim.ini', 'SkyrimPrefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
    },
    fallout3: {
        gameSettingsFiles: ['Fallout.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
    },
    fallout4: {
        gameSettingsFiles: ['Fallout4.ini', 'Fallout4Prefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
    },
    fallout4vr: {
        gameSettingsFiles: ['Fallout4Custom.ini', 'Fallout4Prefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
    },
    falloutnv: {
        gameSettingsFiles: ['Fallout.ini', 'FalloutPrefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
    },
    oblivion: {
        gameSettingsFiles: ['Oblivion.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
    },
};

export function getIniFiles(gameId: string): string[] {
  if (gameSupport[gameId] === undefined) {
    return [];
  } else {
    return gameSupport[gameId].gameSettingsFiles || [];
  }
}

export function generateGameSpecifics(state: types.IState,
                                      gameId: string,
                                      stagingPath: string,
                                      modIds: string[],
                                      mods: { [modId: string]: types.IMod })
                                      : Promise<any> {
  if ((gameSupport[gameId] !== undefined) && (gameSupport[gameId].generator !== undefined)) {
    return gameSupport[gameId].generator(state, gameId, stagingPath, modIds, mods);
  } else {
    return Promise.resolve({});
  }
}

export function parseGameSpecifics(api: types.IExtensionApi,
                                   gameId: string,
                                   collection: ICollection) {
  if ((gameSupport[gameId] !== undefined) && (gameSupport[gameId].parser !== undefined)) {
    return gameSupport[gameId].parser(api, gameId, collection);
  }
}
