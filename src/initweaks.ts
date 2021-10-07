import path = require('path');
import * as React from 'react';
import { actions, fs, log, selectors, types, util } from 'vortex-api';
import { ICollection } from './types/ICollection';
import { IExtendedInterfaceProps } from './types/IExtendedInterfaceProps';
import { IINITweak, TweakArray } from './types/IINITweak';
import TweakList from './views/IniTweaks';

import { INI_TWEAKS_PATH, OPTIONAL_TWEAK_PREFIX } from './constants';

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

function validateFilenameInput(content: types.IDialogContent): types.IConditionResult[] {
  const input = content.input[0].value || '';
  if ((input.length < 2) || !(util as any).isFilenameValid(input)) {
    return [{
      actions: ['Confirm'],
      errorText: 'Has to be a valid file name',
      id: content.input[0].id,
    }];
  } else {
    return [];
  }
}

function TweakListWrap(api: types.IExtensionApi, prop: IExtendedInterfaceProps): JSX.Element {
  return React.createElement(TweakList, {
    ...prop,
    settingsFiles: gameSupport[prop.gameId].gameSettingsFiles,
    refreshTweaks,
    addIniTweak: (modPath: string, settingsFiles: string[]) =>
      addIniTweak(api, modPath, settingsFiles),
    setTweakRequired: (modPath: string, tweak: IINITweak) =>
      setTweakRequired(api, modPath, tweak),
  });
}

async function getTweaks(dirPath: string): Promise<string[]> {
  try {
    const tweaks = await fs.readdirAsync(dirPath);
    return tweaks;
  } catch (err) {
    log('debug', 'failed to find tweaks', err);
    return [];
  }
}

async function refreshTweaks(modPath: string): Promise<TweakArray> {
  const tweakPath = path.join(modPath, INI_TWEAKS_PATH);
  const tweaks = await getTweaks(tweakPath);
  return tweaks.reduce(async (accumP, twk) => {
    const accum = await accumP;
    const required = !twk.startsWith(OPTIONAL_TWEAK_PREFIX);
    const fileName = twk.startsWith(OPTIONAL_TWEAK_PREFIX)
      ? twk.replace(OPTIONAL_TWEAK_PREFIX, '')
      : twk;

    const existingIdx = accum.findIndex(ext => ext.fileName === fileName);
    if (existingIdx !== -1) {
      const reqFile: fs.Stats = await fs.statAsync(path.join(tweakPath, twk));
      const optFile: fs.Stats = await fs.statAsync(path.join(tweakPath, `${OPTIONAL_TWEAK_PREFIX}${twk}`));
      const redundant = (reqFile.mtimeMs > optFile.mtimeMs)
        ? path.join(tweakPath, `${OPTIONAL_TWEAK_PREFIX}${twk}`)
        : path.join(tweakPath, twk);
      try {
        await fs.removeAsync(redundant);
        const updatedReq = (reqFile.mtimeMs > optFile.mtimeMs) ? true : false;
        accum[existingIdx].required = updatedReq;
      } catch (err) {
        log('error', 'failed to remove redundant entry', err);
      }
    } else {
      accum.push({ required, fileName });
    }
    return accum;
  }, Promise.resolve([]));
}

async function addIniTweak(api: types.IExtensionApi,
                           modPath: string,
                           settingsFiles: string[]): Promise<void> {
  return api.showDialog('question', 'Name', {
    text: 'Please enter a name for the ini tweak',
    input: [
      { id: 'name', type: 'text' },
    ],
    choices: settingsFiles.map((fileName, idx) => ({
      text: fileName,
      value: idx === 0,
      id: fileName,
    })),
    condition: validateFilenameInput,
  }, [
    { label: 'Cancel' },
    { label: 'Confirm' },
  ]).then(res => {
    if (res.action === 'Confirm') {
      const tweaksPath = path.join(modPath, INI_TWEAKS_PATH);
      let selectedIni = Object.keys(res.input)
        .find(key => (path.extname(key) === '.ini') && res.input[key] === true);
      if (selectedIni === undefined) {
        // shouldn't be possible since it's radiobuttons and one is preset so
        // one should always be selected.
        return Promise.reject(new Error('No ini file selected'));
      }
      selectedIni = path.basename(selectedIni, path.extname(selectedIni));
      const fileName = `${res.input['name']} [${selectedIni}].ini`;
      return fs.ensureDirWritableAsync(tweaksPath, () => Promise.resolve())
        .then(() => fs.writeFileAsync(path.join(tweaksPath, fileName), ''));
    } else {
      return Promise.resolve();
    }
  });
}

async function setTweakRequired(api: types.IExtensionApi,
                                modPath: string,
                                tweak: IINITweak): Promise<void> {
  const { required, fileName } = tweak;
  try {
    const tweaks: TweakArray = await refreshTweaks(modPath);
    const currentTweak = tweaks.find(twk => twk.fileName.indexOf(fileName) !== -1);
    if (currentTweak !== undefined && required !== currentTweak.required) {
      const src = currentTweak.required
        ? path.join(modPath, INI_TWEAKS_PATH, currentTweak.fileName)
        : path.join(modPath, INI_TWEAKS_PATH, `${OPTIONAL_TWEAK_PREFIX}${currentTweak.fileName}`);
      const dest = required
        ? path.join(path.dirname(src), fileName)
        : path.join(path.dirname(src), `${OPTIONAL_TWEAK_PREFIX}${fileName}`);
      await fs.renameAsync(src, dest);
    }
  } catch (err) {
    api.showErrorNotification('Failed to set ini tweak requirement settings', err);
  }
}

async function enableIniTweaks(api: types.IExtensionApi, gameId: string, mod: types.IMod) {
  const stagingPath = selectors.installPathForGame(api.getState(), gameId);
  const modPath = path.join(stagingPath, mod.installationPath);
  try {
    const tweaks: TweakArray = await refreshTweaks(modPath);
    const required = tweaks.filter(tweak => tweak.required);
    const optional = tweaks.filter(tweak => !tweak.required);
    const batched = required.map(req =>
      actions.setINITweakEnabled(gameId, mod.id, req.fileName, true));
    util.batchDispatch(api.store, batched);
    await enableOptionalIniTweaks(api, gameId, mod, optional);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      api.showErrorNotification('Failed to enable collection ini tweaks', err);
    }
  }
}

async function enableOptionalIniTweaks(api: types.IExtensionApi,
                                       gameId: string,
                                       mod: types.IMod,
                                       optionalTweaks: TweakArray) {
  return api.showDialog('question', 'Recommended/Optional INI Tweaks', {
    text: 'The collection curator has highlighted several INI tweaks as recommended, '
        + 'but optional. Although your game will probably benefit from these tweaks, it '
        + 'is your choice whether you want to apply these.',
    checkboxes: optionalTweaks.map((tweak, idx) => ({
      id: tweak.fileName,
      text: tweak.fileName,
      value: false,
    })),
  }, [
    { label: 'Cancel' },
    { label: 'Confirm' },
  ]).then((result: types.IDialogResult) => {
    if (result.action === 'Confirm') {
      const choices = Object.keys(result.input).filter(id => choices[id]);
      const batched = choices.map(choice =>
        actions.setINITweakEnabled(gameId, mod.id, choice, true));
      util.batchDispatch(api.store, batched);
      return Promise.resolve();
    } else {
      return Promise.resolve();
    }
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
    (prop: IExtendedInterfaceProps) => TweakListWrap(context.api, prop));
}

export default init;
