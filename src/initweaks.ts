import path = require('path');
import * as React from 'react';
import { actions, fs, selectors, types } from 'vortex-api';
import { ICollection } from './types/ICollection';
import { IExtendedInterfaceProps } from './types/IExtendedInterfaceProps';
import TweakList from './views/IniTweaks';

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

function isSupported(gameId: string) {
  return gameSupport[gameId] !== undefined;
}

function TweakListWrap(prop: IExtendedInterfaceProps): JSX.Element {
  return React.createElement(TweakList, {
    settingsFiles: gameSupport[prop.gameId].gameSettingsFiles,
    ...prop,
  });
}

async function enableIniTweaks(api: types.IExtensionApi, gameId: string, mod: types.IMod) {
  const stagingPath = selectors.installPathForGame(api.getState(), gameId);
  const tweaks: string[] =
    await fs.readdirAsync(path.join(stagingPath, mod.installationPath, 'INI Tweaks'));
  tweaks.forEach(fileName => {
    api.store.dispatch(actions.setINITweakEnabled(gameId, mod.id, fileName, true));
  });
}

function init(context: types.IExtensionContext) {
  context.optional.registerCollectionFeature(
    'ini-tweaks',
    () => Promise.resolve({}),
    (gameId: string, collection: ICollection, mod: types.IMod) =>
      enableIniTweaks(context.api, gameId, mod),
    () => Promise.resolve(),
    () => 'INI Tweaks',
    (state: types.IState, gameId: string) => isSupported(gameId),
    TweakListWrap);
}

export default init;
