import * as _ from 'lodash';
import { types, util } from 'vortex-api';

export function testDownloadReference(download: types.IDownload,
                                      reference: types.IReference)
                                      : boolean {
  if (download === undefined) {
    return false;
  }

  const modId = download.modInfo?.meta?.details?.modId
              ?? download.modInfo?.nexus?.ids?.modId;

  const fileId = download.modInfo?.meta?.details?.fileId
              ?? download.modInfo?.nexus?.ids?.fileId;

  const lookup = {
    fileMD5: download.fileMD5,
    fileName: download.localPath,
    fileSizeBytes: download.size,
    version: download.modInfo?.version,
    logicalFileName: download.modInfo?.name,
    game: download.game,
    source: download.modInfo?.source,
    modId,
    fileId,
  };

  return util.testModReference(lookup, reference);
}
