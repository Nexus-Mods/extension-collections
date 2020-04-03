import * as _ from 'lodash';
import * as semver from 'semver';
import { types, util } from 'vortex-api';

export function findModByRef(reference: types.IModReference,
                             mods: { [modId: string]: types.IMod }): types.IMod {
  return Object.values(mods).find((mod: types.IMod): boolean =>
    util.testModReference(mod, reference));
}

export function isFuzzyVersion(versionMatch: string) {
  if (!versionMatch) {
    return false;
  }
  return isNaN(parseInt(versionMatch[0], 16))
    || (semver.validRange(versionMatch)
      !== versionMatch);
}

function newerSort(lhs: types.IDownload, rhs: types.IDownload): number {
  const lVersion = semver.coerce(util.getSafe(lhs, ['modInfo', 'version'], undefined));
  const rVersion = semver.coerce(util.getSafe(rhs, ['modInfo', 'version'], undefined));

  if ((lVersion !== null) && (rVersion !== null)) {
    return semver.compare(rVersion, lVersion);
  }

  return rhs.fileTime - lhs.fileTime;
}

export function testDownloadReference(download: types.IDownload,
                                      reference: types.IReference)
                                      : boolean {
  if (download === undefined) {
    return false;
  }

  if (!(download.game || []).includes(reference.gameId)) {
    return false;
  }

  const lookup = {
    fileMD5: download.fileMD5,
    fileName: download.localPath,
    fileSizeBytes: download.size,
    version: util.getSafe(download, ['modInfo', 'version'], undefined),
    logicalFileName: util.getSafe(download, ['modInfo', 'name'], undefined),
    game: download.game,
    source: download.modInfo?.source,
    modId: download.modInfo?.nexus?.ids?.modId,
    fileId: download.modInfo?.nexus?.ids?.fileId,
  };

  return util.testModReference(lookup, reference);
}

export function findDownloadIdByRef(reference: types.IReference,
                                    downloads: { [dlId: string]: types.IDownload })
                                    : string {
  if (isFuzzyVersion(reference.versionMatch)
    && (reference.fileMD5 !== undefined)
    && ((reference.logicalFileName !== undefined)
      || (reference.fileExpression !== undefined))) {
    reference = _.omit(reference, ['fileMD5']);
  }

  const existing: string[] = Object.keys(downloads)
    .filter((dlId: string): boolean => testDownloadReference(downloads[dlId], reference))
    .sort((lhs, rhs) => newerSort(downloads[lhs], downloads[rhs]));
  return existing[0];
}
