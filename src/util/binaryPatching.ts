import * as bsdiffT from 'bsdiff-node';
import * as crc32 from 'crc-32';
import * as path from 'path';
import { fs, log, selectors, types, util } from 'vortex-api';
import { PATCHES_PATH } from '../constants';

const bsdiff = util.lazyRequire<typeof bsdiffT>(() => require('bsdiff-node'));

function crcFromBuf(data: Buffer) {
  // >>> 0 converts signed to unsigned
  return (crc32.buf(data) >>> 0).toString(16).toUpperCase();
}

export async function scanForDiffs(api: types.IExtensionApi, gameId: string,
                                   modId: string, destPath: string) {
  const state = api.getState();
  const mod = state.persistent.mods[gameId][modId];

  const stagingPath = selectors.installPathForGame(state, gameId);

  const localPath = path.join(stagingPath, mod.installationPath);
  const archive = state.persistent.downloads.files[mod.archiveId];

  if (archive === undefined) {
    throw new util.ProcessCanceled('Archive not found');
  }

  const choices = mod.attributes?.installerChoices;

  const instRes: types.IInstallResult = (await
    api.emitAndAwait('simulate-installer', gameId, mod.archiveId, { choices }))[0];

  const dlPath = selectors.downloadPathForGame(state, archive.game[0]);
  const archivePath = path.join(dlPath, archive.localPath);

  const sourceChecksums: { [fileName: string]: string } = {};
  const szip = new util.SevenZip();
  const archFiles = await szip.list(archivePath, undefined, async entries => {
      for (const entry of entries) {
        if (entry.attr !== 'D') {
          sourceChecksums[entry.name] = entry['crc'].toUpperCase();
        }
      }
    });

  const result: { [filePath: string]: string } = {};

  for (const file of instRes.instructions.filter(instr => instr.type === 'copy')) {
    const srcCRC = sourceChecksums[file.source];
    const dstFilePath = path.join(localPath, file.destination);
    const dat = await fs.readFileAsync(dstFilePath);
    const dstCRC =  crcFromBuf(dat);
    if (srcCRC !== dstCRC) {
      log('debug', 'found modified file', { filePath: file.source, srcCRC, dstCRC });
      const srcFilePath =
        path.join(util.getVortexPath('temp'), `simulating_${mod.archiveId}`, file.source);
      const patchPath = path.join(destPath, file.destination + '.diff');
      await fs.ensureDirWritableAsync(path.dirname(patchPath));
      await bsdiff.diff(srcFilePath, dstFilePath, patchPath, progress => {
        // nop - currently not showing progress
      });
      result[file.destination] = srcCRC;
      log('debug', 'patch created at', patchPath);
    }
  }

  return result;
}

export async function applyPatches(api: types.IExtensionApi,
                                   collectionPath: string, gameId: string,
                                   modName: string, modId: string,
                                   patches: { [filePath: string]: string }) {

  const state = api.getState();
  const installPath = selectors.installPathForGame(state, gameId);
  const mod = state.persistent.mods[gameId][modId];
  const modPath = path.join(installPath, mod.installationPath);
  const patchesPath = path.join(installPath, collectionPath, PATCHES_PATH, modName);

  for (const filePath of Object.keys(patches ?? {})) {
    try {
      const srcPath = path.join(modPath, filePath);
      const srcDat = await fs.readFileAsync(srcPath);
      const srcCRC = crcFromBuf(srcDat);
      if (srcCRC === patches[filePath]) {
        await bsdiff.patch(
          srcPath, srcPath + '.patched', path.join(patchesPath, filePath) + '.diff');
        await fs.removeAsync(srcPath);
        await fs.renameAsync(srcPath + '.patched', srcPath);
        log('info', 'patched', srcPath);
      } else {
        log('warn', 'patch not applied because reference CRC differs', { filePath, srcCRC });
      }
    } catch (err) {
      api.showErrorNotification('failed to patch', err, {
        message: filePath,
      });
    }
  }
}
