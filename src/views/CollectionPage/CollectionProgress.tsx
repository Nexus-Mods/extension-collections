import { IModEx } from '../../types/IModEx';

import CollectionBanner from './CollectionBanner';

import i18next from 'i18next';
import * as React from 'react';
import { Button, Table } from 'react-bootstrap';
import { ComponentEx, FlexLayout, ProgressBar, types, util } from 'vortex-api';

export interface ICollectionProgressProps {
  t: i18next.TFunction;
  mods: { [modId: string]: IModEx };
  downloads: { [dlId: string]: types.IDownload };
  totalSize: number;
  onCancel: () => void;
  onPause: () => void;
}

class CollectionProgress extends ComponentEx<ICollectionProgressProps, {}> {
  public render(): JSX.Element {
    const {t, mods, totalSize, onCancel, onPause} = this.props;

    const group = (state: string): string => {
      return {
        null: 'pending',
        installed: 'done',
        downloaded: 'installing',
        installing: 'installing',
        downloading: 'downloading',
      }[state];
    };

    interface IModGroups {
      pending: IModEx[]; downloading: IModEx[]; installing: IModEx[]; done: IModEx[];
    }

    const { pending, downloading, installing, done } =
      Object.values(mods).reduce<IModGroups>((prev, mod) => {
        prev[group(mod.state)].push(mod);
        return prev;
      }, { pending: [], downloading: [], installing: [], done: [] });

    if ((downloading.length === 0) && (installing.length === 0)) {
      return null;
    }

    const downloadProgress = Object.values(mods).reduce((prev, mod) => {
      let size = 0;
      if (['installed', 'installing'].includes(mod.state)) {
        size += util.getSafe(mod, ['attributes', 'fileSize'], 0);
      } else {
        size += util.getSafe(mod, ['attributes', 'received'], 0);
      }
      return prev + size;
    }, 0);

    return (
      <FlexLayout type='row'>
        <FlexLayout.Flex>
          <FlexLayout type='column' className='collection-progress-flex'>
            <ProgressBar
              now={downloadProgress}
              max={totalSize}
              labelLeft={t('Downloading')}
              labelRight={
                `${util.bytesToString(downloadProgress)} / ${util.bytesToString(totalSize)}`}
            />
            {(installing.length > 0) ? (
              <ProgressBar
                now={done.length}
                max={Object.keys(mods).length}
                labelLeft={t('Installing')}
                labelRight={util.renderModName(installing[0])}
              />
            ) : null}
          </FlexLayout>
        </FlexLayout.Flex>
        <FlexLayout.Fixed>
          <FlexLayout type='column' className='collection-pause-cancel-flex'>
            <Button onClick={onPause}>
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
}

export default CollectionProgress;
