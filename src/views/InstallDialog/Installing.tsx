import InstallDriver from '../../util/InstallDriver';

import InstallProgress from './InstallProgress';

import i18next from 'i18next';
import * as React from 'react';
import { Button, Carousel, OverlayTrigger, Popover } from 'react-bootstrap';
import { WithTranslation, withTranslation, I18nextProvider } from 'react-i18next';
import { FlexLayout, Icon, types, util } from 'vortex-api';

// const CYCLE_INTERVAL = 10 * 1000;
const CYCLE_INTERVAL = null;

interface IInstallDialogInstallingProps extends WithTranslation {
  driver: InstallDriver;
}

interface IDescriptionPopoverProps extends WithTranslation {
  description: string;
}

function DescriptionPopover(props: IDescriptionPopoverProps) {
  return (
    <>
      <h3>{name}</h3>
      <div>{(util as any).renderBBCode(props.description)}</div>
    </>
  );
}

const DescriptionPopoverTrans = withTranslation(['common'])(DescriptionPopover) as any;

class InstallDialogInstalling extends React.Component<IInstallDialogInstallingProps, {}> {
  public render(): JSX.Element {
    const { t, driver } = this.props;
    const { installedMods } = this.props.driver;

    return (
      <FlexLayout type='column' className='modpack-flex-installing'>
        <FlexLayout.Flex>
          {installedMods.length > 0 ? (
            <Carousel
              interval={CYCLE_INTERVAL}
              prevIcon={<Icon name='nav-back' />}
              nextIcon={<Icon name='nav-forward' />}
            >
              {installedMods.map(mod => this.renderItem(mod))}
            </Carousel>
          ) : (
            <div>{t('Nothing installed')}</div>
          )}
        </FlexLayout.Flex>
        <FlexLayout.Fixed style={{ width: '90%' }}>
          <InstallProgress t={t} driver={driver} />
        </FlexLayout.Fixed>
      </FlexLayout>
    );
  }

  private renderItem(mod: types.IMod): JSX.Element {
    const { t, i18n } = this.props;

    const name: string = util.renderModName(mod);
    const author: string = util.getSafe(mod, ['attributes', 'author'], '<Unknown>');
    const short: string = util.getSafe(mod, ['attributes', 'shortDescription'], '');
    const description: string = util.getSafe(mod, ['attributes', 'description'], undefined);
    const url: string = util.getSafe(mod, ['attributes', 'pictureUrl'], undefined);

    const popover: JSX.Element = !!description ? (
      <Popover
          id={`modpack-mod-description-${mod.id}`}
          className='modpack-description-popover'
      >
        <I18nextProvider i18n={i18n}>
          <DescriptionPopoverTrans description={description} />
        </I18nextProvider>
      </Popover>
    ) : null;

    return (
      <Carousel.Item key={mod.id}>
        <img src={url} />
        <Carousel.Caption>
          <h1>{name}</h1>
          <h3>{t('by {{author}}', {
            replace: {
              author,
            },
          })}</h3>
          <p>{short}</p>
          {!!description ? (
            <OverlayTrigger trigger='click' rootClose placement='top' overlay={popover}>
              <Button>{t('Full description')}</Button>
            </OverlayTrigger>
          ) : null}
        </Carousel.Caption>
      </Carousel.Item>
    );
  }
}

export default withTranslation(['common'])(InstallDialogInstalling);
