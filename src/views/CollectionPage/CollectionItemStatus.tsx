import { IModEx } from '../../types/IModEx';

import i18next from 'i18next';
import * as React from 'react';
import { ProgressBar } from 'react-bootstrap';
import { Spinner, types } from 'vortex-api';

interface ICollectionItemStatusProps {
  t: i18next.TFunction;
  mod: IModEx;
  download: types.IDownload;
  notifications: types.INotification[];
  container: Element;
  installing: boolean;
}

class CollectionItemStatus extends React.Component<ICollectionItemStatusProps, {}> {
  public render(): JSX.Element {
    const { t, download, installing, mod } = this.props;

    if (mod.state === 'installed') {
      return mod.enabled ? t('Enabled') : t('Disabled');
    } else if (mod.state === 'installing') {
      // install (or rather: extraction) process is unfortunately only stored in the notification
      return (
        <div className='collection-status-progress'>
          <ProgressBar
            now={mod.progress * 100}
            max={100}
            bsStyle='info'
            label={<div>&nbsp;</div>}
          />
          <div className='progress-title'>{t('Installing...')}</div>
        </div>
      );
    } else if (mod.state === 'downloading') {
      if (download.state === 'paused') {
        return <div>{t('Download paused')}</div>;
      } else if (download.state === 'failed') {
        return <div>{t('Download failed')}</div>;
      }
      return (
        <div className='collection-status-progress'>
          <ProgressBar
            now={mod.progress * 100}
            max={100}
            bsStyle='info'
            label={<div>&nbsp;</div>}
          />
          <div className='progress-title'>{t('Downloading...')}</div>
        </div>
      );
    } else {
      if (mod.collectionRule.type === 'recommends') {
        return <div>{t('Not installed')}</div>;
      } else {
        const indicator = installing ? <Spinner/> : null;
        if (mod.state === 'downloaded') {
          return <div>{indicator}{t('Install pending')}</div>;
        } else {
          return <div>{indicator}{t('Download pending')}</div>;
        }
      }
    }
  }
}

export default CollectionItemStatus;
