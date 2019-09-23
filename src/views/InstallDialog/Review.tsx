import InstallDriver from '../../util/InstallDriver';

import i18next from 'i18next';
import * as React from 'react';
import { FlexLayout, util } from 'vortex-api';

interface IInstallDialogReviewProps {
  t: i18next.TFunction;
  driver: InstallDriver;
}

class InstallDialogReview extends React.Component<IInstallDialogReviewProps, {}> {
  public render(): JSX.Element {
    const { t, driver } = this.props;
    return (
      <FlexLayout type='column'>
        <FlexLayout.Fixed>
          <div className='modpack-review'>
            {t('Installation completed.')}
            <br/>
            {t('The modpack will appear as a mod in your mod list with the '
              + 'name "{{modpackName}}."', {
              replace: {
                modpackName: util.renderModName(driver.modPack),
              },
            })}
            <br/>
            {t('This entry can be used to change configuration options of the pack '
              + 'if it has any, it\'s also used to track updates and you will receive '
              + 'warnings if you disable or remove mods that belong to the pack.')}
            <br/>
            {t('If you want to stop tracking the modpack you can just disable or remove it, '
              + 'the mods that were installed with the pack will continue to work.')}
          </div>
        </FlexLayout.Fixed>
      </FlexLayout>
    );
  }
}

export default InstallDialogReview;
