import * as gamebryo from './gamebryo';

import { types } from 'vortex-api';
import { ICollection } from '../../types/ICollection';
import { IGameSpecificInterfaceProps } from '../../types/IGameSpecificInterfaceProps';

const gameSupport = {
    skyrim: {
        gameSettingsFiles: ['Skyrim.ini', 'SkyrimPrefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    skyrimse: {
        gameSettingsFiles: ['Skyrim.ini', 'SkyrimPrefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    skyrimvr: {
        gameSettingsFiles: ['Skyrim.ini', 'SkyrimPrefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    fallout3: {
        gameSettingsFiles: ['Fallout.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    fallout4: {
        gameSettingsFiles: ['Fallout4.ini', 'Fallout4Prefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    fallout4vr: {
        gameSettingsFiles: ['Fallout4Custom.ini', 'Fallout4Prefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    falloutnv: {
        gameSettingsFiles: ['Fallout.ini', 'FalloutPrefs.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    oblivion: {
        gameSettingsFiles: ['Oblivion.ini'],
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
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

export function getInterface(gameId: string): React.ComponentType<IGameSpecificInterfaceProps> {
  if (gameSupport[gameId] === undefined) {
    return null;
  } else {
    return gameSupport[gameId].interface;
  }
}
