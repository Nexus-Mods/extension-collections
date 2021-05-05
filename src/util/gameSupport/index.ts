import * as gamebryo from './gamebryo';

import { log, types, util } from 'vortex-api';
import { ICollection } from '../../types/ICollection';
import { IExtendedInterfaceProps } from '../../types/IExtendedInterfaceProps';
import { IGameSupportEntry } from '../../types/IGameSupportEntry';

const gameSupport = {
    skyrim: {
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    skyrimse: {
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    skyrimvr: {
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    fallout3: {
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    fallout4: {
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    fallout4vr: {
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    falloutnv: {
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
    oblivion: {
        generator: gamebryo.generate,
        parser: gamebryo.parser,
        interface: gamebryo.Interface,
    },
};

export function addGameSupport(entry: IGameSupportEntry) {
  if ((entry as IGameSupportEntry) === undefined) {
    throw new util.DataInvalid('Failed attempt to add gamesupport entry - invalid argument');
  }

  if (gameSupport[entry.gameId] !== undefined) {
    return;
  }

  gameSupport[entry.gameId] = {
    generator: entry.generator,
    parser: entry.parser,
    interface: (props) => entry.interface(props),
  };
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

export function getInterface(gameId: string): React.ComponentType<IExtendedInterfaceProps> {
  if (gameSupport[gameId] === undefined) {
    return null;
  } else {
    return gameSupport[gameId].interface;
  }
}
