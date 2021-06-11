import { IModEx } from '../../types/IModEx';

import CollectionBanner from './CollectionBanner';

import i18next from 'i18next';
import * as React from 'react';
import { Button, Table } from 'react-bootstrap';
import { ComponentEx, FlexLayout, ProgressBar, Spinner, types, util } from 'vortex-api';

export interface ICollectionProgressProps {
  t: i18next.TFunction;
  mods: { [modId: string]: IModEx };
  downloads: { [dlId: string]: types.IDownload };
  totalSize: number;
  activity: { [id: string]: string };
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
}

class CollectionProgress extends ComponentEx<ICollectionProgressProps, {}> {
  public render(): JSX.Element {
    const {t, activity, downloads, mods, totalSize, onCancel, onPause, onResume} = this.props;

    const group = (state: string, download?: types.IDownload): string => {
      if ((state === 'downloading') && (download?.state === 'paused')) {
        // treating paused downloads as "pending" for the purpose of progress indicator
        return 'pending';
      }

      return {
        null: 'pending',
        installed: 'done',
        downloaded: 'pending',
        installing: 'installing',
        downloading: 'downloading',
      }[state];
    };

    interface IModGroups {
      pending: IModEx[]; downloading: IModEx[]; installing: IModEx[]; done: IModEx[];
    }

    const { pending, downloading, installing, done } =
      Object.values(mods).reduce<IModGroups>((prev, mod) => {
        if (mod.collectionRule.type === 'requires') {
          prev[group(mod.state, downloads[mod.archiveId])].push(mod);
        }
        return prev;
      }, { pending: [], downloading: [], installing: [], done: [] });

    if ((downloading.length === 0) && (installing.length === 0) && (pending.length === 0)) {
      return null;
    }

    return (
      <FlexLayout type='row'>
        <FlexLayout.Flex>
          <FlexLayout type='column' className='collection-progress-flex'>
            {((activity['dependencies'] ?? []).length > 0)
              ? this.renderActivity(t('Checking Dependencies'))
              : this.renderBars(installing, done)}
          </FlexLayout>
        </FlexLayout.Flex>
        <FlexLayout.Fixed>
          <FlexLayout type='column' className='collection-pause-cancel-flex'>
            <Button disabled={pending.length === 0 && installing.length === 0} onClick={onResume}>
              {t('Resume')}
            </Button>
            <Button disabled={downloading.length === 0} onClick={onPause}>
              {t('Pause')}
            </Button>
            <Button onClick={onCancel}>
              {t('Cancel')}
            </Button>
          </FlexLayout>
        </FlexLayout.Fixed>
        <FlexLayout.Fixed>
          <CollectionBanner t={t} totalSize={totalSize} />
        </FlexLayout.Fixed>
      </FlexLayout>
    );
  }

  private renderActivity(message: string) {
    return (
      <div><Spinner/>{message}</div>
    );
  }

  private renderBars(installing: IModEx[], done: IModEx[]) {
    const {t, downloads, mods, totalSize} = this.props;

    const curInstall = (installing.length > 0)
      ? installing.find(iter => iter.state === 'installing')
      : undefined;

    const downloadProgress = Object.values(mods).reduce((prev, mod) => {
      let size = 0;
      if ((mod.state === 'downloading') || (mod.state === null)) {
        const download = downloads[mod.archiveId];
        size += download?.received || 0;
      } else {
        size += mod.attributes?.fileSize || 0;
      }
      return prev + size;
    }, 0);

    return (
      <>
        <ProgressBar
          now={downloadProgress}
          max={totalSize}
          showPercentage
          labelLeft={t('Downloading')}
          labelRight={
            `${util.bytesToString(downloadProgress)} / ${util.bytesToString(totalSize)}`}
        />
        <ProgressBar
          now={done.length}
          max={Object.keys(mods).length}
          showPercentage
          labelLeft={installing.length > 0 ? t('Installing') : t('Waiting to install')}
          labelRight={curInstall !== undefined ? util.renderModName(curInstall) : undefined}
        />
      </>
    );
  }
}

export default CollectionProgress;
