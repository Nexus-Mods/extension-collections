import InstallDriver from '../../util/InstallDriver';

import InstallProgress from './InstallProgress';

import i18next from 'i18next';
import * as React from 'react';
import { FlexLayout, util } from 'vortex-api';

interface IInstallDialogDisclaimerProps {
  t: i18next.TFunction;
  driver: InstallDriver;
}

class InstallDialogDisclaimer extends React.Component<IInstallDialogDisclaimerProps, {}> {
  public render(): JSX.Element {
    const { t, driver } = this.props;

    return (
      <FlexLayout type='column' className='modpack-flex-disclaimer'>
        <FlexLayout.Flex>
          <div className='modpack-disclaimer'>
            <div className='modpack-disclaimer-intro'>
              {t('Mods are being downloaded and installed in the background. Please use this '
                + 'time to familiarize yourself with what you\'re installing.')}
            </div>
            {t('A few things you should note:')}
            <ul>
              <li>{t('Mod packs usually contain mods from various authors, they probably '
                   + 'have no association with the creator of the pack.')}</li>
              <li>{t('Mod authors provide their own instructions on how to install their '
                   + 'mods. If an individial mod doesn\'t work please don\'t complain to '
                   + 'its author or ask for help without first applying their instructions.')}</li>
              <li>{t('Mods are provided for free. If you paid money for this pack '
                   + 'that money probably only went to the creator of the pack, it didn\'t go '
                   + 'towards financing the download traffic or to the development of the '
                   + 'mods themselves.')}</li>
              <li>{t('If you like these mods, please endorse them, not just the pack. '
                   + 'Many mod authors will also appreciate donations or sponsoring through '
                   + 'Patreon and similar.')}</li>
              <li>{t('Modding can be a complex process. A mod pack is intended to save you '
                   + 'menial task of downloading and installing a lot of mods and helps you '
                   + 'find mods that work well together but it can\'t remove the complexity '
                   + 'entirely.')}</li>
              <li>{t('Nexus Mods has tens of thousands of mods, check them out and really make '
                   + 'the game your own!')}</li>
            </ul>
          </div>
        </FlexLayout.Flex>
        <FlexLayout.Fixed style={{ width: '90%' }}>
          <InstallProgress t={t} driver={driver} />
        </FlexLayout.Fixed>
      </FlexLayout>
    );
  }
}

export default InstallDialogDisclaimer;
