import * as React from 'react';
import { types } from 'vortex-api';
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
    settingsFiles: gameSupport[prop.gameId],
    ...prop,
  });
}

function init(context: types.IExtensionContext) {
  // the parse/generate functions don't actually have to do anything because
  // initweaks are stored on disk as part of the collection mod and will be bundled
  // automatically
  context.optional['registerCollectionFeature'](
    'ini-tweaks',
    () => Promise.resolve({}),
    () => Promise.resolve(),
    () => 'INI Tweaks',
    (state: types.IState, gameId: string) => isSupported(gameId),
    TweakListWrap);
}

export default init;
