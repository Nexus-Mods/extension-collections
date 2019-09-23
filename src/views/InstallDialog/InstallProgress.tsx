import InstallDriver from '../../util/InstallDriver';

import i18next from 'i18next';
import * as React from 'react';

// tslint:disable-next-line:no-var-requires
const { ProgressBar } = require('vortex-api');

interface IInstallProgressProps {
  t: i18next.TFunction;
  driver: InstallDriver;
}

class InstallProgress extends React.Component<IInstallProgressProps, {}> {
  public render(): JSX.Element {
    const { t, driver } = this.props;
    const label = t('Installing {{fileName}}', { replace: { fileName: driver.installingMod } })
                || t('Preparing');

    if (driver.installDone) {
      return t('Installation complete');
    }

    return (
      <ProgressBar
        now={driver.installedMods.length}
        max={driver.numRequired}
        labelLeft={label}
      />
    );
  }
}

export default InstallProgress;
