import { NEXUS_MEMBERSHIP_URL } from '../../constants';
import InstallDriver from '../../util/InstallDriver';

import i18next from 'i18next';
import * as React from 'react';
import { Button } from 'react-bootstrap';
import { FlexLayout, util } from 'vortex-api';

interface IInstallDialogStartProps {
  t: i18next.TFunction;
  driver: InstallDriver;
  isPremium: boolean;
}

class InstallDialogStart extends React.Component<IInstallDialogStartProps, {}> {
  public render(): JSX.Element {
    const { t, driver, isPremium } = this.props;
    const { collection } = driver;

    const numMods: number = collection.rules
      .filter(rule => ['requires', 'recommended'].indexOf(rule.type) !== -1)
      .length;

    return (
      <FlexLayout type='column' className='modpack-flex-start'>
        <FlexLayout.Fixed>
          <div className='modpack-name'>
            {t('Installing Collection')} {util.renderModName(collection)}
          </div>
          <div className='modpack-author'>
            {t('Created by {{author}}', {
              replace: {
                author: util.getSafe(collection.attributes, ['author'], '<Unkown Author>'),
              },
            })}
          </div>
          <div className='modpack-instructions'>
            {t('When you click "Next", Vortex will download and install the {{count}} '
              + 'mods included in this pack.', {
              count: numMods,
            })}
            {isPremium ? t('This process will be mostly automatic but under some circumstances '
                          + 'your attention may be requested.')
                       : t('Since you\'re not a premium user you will have to start each '
                          + 'download by visiting the website - we will guide you through '
                          + 'that process. For premium users this is fully automated.')}
            {isPremium ? null : (
              <Button bsStyle='ad' onClick={this.goBuyPremium}>
                {t('Go Premium to get faster downloads and a more automated experience.')}
              </Button>
            )}
          </div>
        </FlexLayout.Fixed>
      </FlexLayout>
    );
  }

  private goBuyPremium = () => {
    util.opn(NEXUS_MEMBERSHIP_URL).catch(err => undefined);
  }
}

export default InstallDialogStart;
