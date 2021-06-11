import { IModEx } from '../../types/IModEx';

import i18next from 'i18next';
import * as React from 'react';
import { ProgressBar } from 'react-bootstrap';
import { Option, OptionValues } from 'react-select';
import { SelectUpDown, Spinner, types } from 'vortex-api';

interface ICollectionItemStatusProps {
  t: i18next.TFunction;
  mod: IModEx;
  download: types.IDownload;
  notifications: types.INotification[];
  container: Element;
  onSetModEnabled: (modId: string, enabled: boolean) => void;
  installing: boolean;
}

class CollectionItemStatus extends React.Component<ICollectionItemStatusProps, {}> {
  public render(): JSX.Element {
    const { t, container, installing, mod } = this.props;

    if (mod.state === 'installed') {
      const options = [
        { key: 'enabled', text: 'Enabled' },
        { key: 'disabled', text: 'Disabled' },
      ];
      return (
        <SelectUpDown
          options={options}
          value={mod.enabled ? 'enabled' : 'disabled'}
          onChange={this.changeDownloaded}
          valueKey='key'
          labelKey='text'
          clearable={false}
          searchable={false}
          container={container}
        />
      );
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
        return <div>{t('Optional')}</div>;
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

  private changeDownloaded = (input: Option<OptionValues>) => {
    const { mod } = this.props;
    this.props.onSetModEnabled(mod.id, input.key === 'enabled');
  }
}

export default CollectionItemStatus;
