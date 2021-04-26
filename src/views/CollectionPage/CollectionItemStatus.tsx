import { IModEx } from '../../types/IModEx';

import i18next from 'i18next';
import * as React from 'react';
import { ProgressBar } from 'react-bootstrap';
import { SelectUpDown, Spinner, types } from 'vortex-api';
import { Option, OptionValues } from 'react-select';

interface ICollectionItemStatusProps {
  t: i18next.TFunction;
  mod: IModEx;
  download: types.IDownload;
  notifications: types.INotification[];
  container: Element;
  onSetModEnabled: (modId: string, enabled: boolean) => void;
}

class CollectionItemStatus extends React.Component<ICollectionItemStatusProps, {}> {
  public render(): JSX.Element {
    const { t, container, mod } = this.props;

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
        return <div>{t('Optional')}</div>
      } else {
        if (mod.state === 'downloaded') {
          return <div><Spinner />{t('Install pending')}</div>;
        } else {
          return <div><Spinner />{t('Download pending')}</div>;
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
