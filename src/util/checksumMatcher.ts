import * as Bluebird from 'bluebird';
import * as crc32 from 'crc-32';
import * as path from 'path';
import { fs, log, selectors, types, util } from 'vortex-api';

import { ReplicateHashMismatchError } from '../util/errors';

function crcFromBuf(data: Buffer) {
  // >>> 0 converts signed to unsigned
  return (crc32.buf(data) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

const queue = util.makeQueue();

export function matchChecksums(api: types.IExtensionApi,
                               gameId: string,
                               modId: string): Bluebird<void> {
  const state = api.getState();
  const mod = state.persistent.mods[gameId][modId];
  if (!mod?.archiveId) {
    throw new util.ProcessCanceled('Mod not found');
  }

  const stagingPath = selectors.installPathForGame(state, gameId);

  const localPath = path.join(stagingPath, mod.installationPath);
  const archive = state.persistent.downloads.files[mod.archiveId!];

  if (archive === undefined) {
    throw new util.ProcessCanceled('Archive not found');
  }

  const choices = mod.attributes?.installerChoices;
  return queue(() => new Bluebird<void>((resolve, reject) => {
    api.events.emit('simulate-installer', gameId, mod.archiveId, { choices },
      async (instRes: types.IInstallResult, tempPath: string) => {
        try {
          const dlPath = selectors.downloadPathForGame(state, archive.game[0]);
          const archivePath = path.join(dlPath, archive.localPath!);

          const sourceChecksums: { [fileName: string]: string } = {};
          const szip = new util.SevenZip();
          await szip.list(archivePath, undefined, async entries => {
            for (const entry of entries) {
              if (entry.attr !== 'D') {
                try {
                  sourceChecksums[entry.name] = entry['crc'].toUpperCase();
                } catch (err) {
                  api.showErrorNotification!('Failed to determine checksum for file', err, {
                    message: entry.name,
                  });
                }
              }
            }
          });

          let entries: string[] = [];
          await util.walk(localPath, async input => {
            entries = [].concat(entries, input);
          }, {});

          const copyInstructions = instRes.instructions.filter(instr => instr.type === 'copy');
          const matched: Set<string> = new Set();
          for (const file of copyInstructions) {
            const srcCRC = sourceChecksums[file.source!];
            let relevantEntries = entries.filter(entry => path.basename(entry) === path.basename(file.source));
            await new Promise<void>(async (resolve, _) => {
              for (const entry of relevantEntries) {
                const isDirectory = (await fs.statAsync(entry)).isDirectory();
                if (isDirectory) {
                  log('debug', 'skipping directory', { filePath: entry, srcCRC });
                  continue;
                }
                const data = await fs.readFileAsync(entry);
                const dstCRC = crcFromBuf(data);
                if (dstCRC === srcCRC) {
                  log('debug', 'found matching file', { filePath: entry, srcCRC, dstCRC });
                  matched.add(path.basename(entry));
                }
              }
              return resolve();
            });
          }
          if (matched.size !== copyInstructions.length) {
            const mismatched = copyInstructions
              .filter(instr => !matched.has(path.basename(instr.source)))
              .map(instr => path.basename(instr.source));
            return reject(new ReplicateHashMismatchError(mismatched));
          }
          return resolve();
        } catch (err) {
          return reject(err);
        }
      })
  }), false) as Bluebird<void>;
}
