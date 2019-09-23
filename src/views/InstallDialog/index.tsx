import InstallDriver, { Step } from '../../util/InstallDriver';

import InstallDialogDisclaimer from './Disclaimer';
import InstallDialogInstalling from './Installing';
import InstallDialogReview from './Review';
import InstallDialogStart from './Start';

import * as React from 'react';
import { Button } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { actions, ComponentEx, fs, Modal, selectors, Steps, types, util } from 'vortex-api';

interface IInstallDialogProps {
  onHide: () => void;
  visible: boolean;
  driver: InstallDriver;
}

interface IConnectedProps {
  profile: types.IProfile;
  mods: { [modId: string]: types.IMod };
  isPremium: boolean;
}

interface IActionProps {
}

type IProps = IInstallDialogProps & IConnectedProps & IActionProps;

interface IInstallDialogState {
}

class InstallDialog extends ComponentEx<IProps, IInstallDialogState> {
  constructor(props: IProps) {
    super(props);

    this.initState({
    });

    if (props.driver !== undefined) {
      this.props.driver.onUpdate(() => this.forceUpdate());
    }
  }

  public componentDidUpdate(prevProps: IProps) {
    if ((this.props.driver !== undefined) && (this.props.driver !== prevProps.driver))  {
      this.props.driver.onUpdate(() => this.forceUpdate());
    }
  }

  public render(): React.ReactNode {
    const { t, driver, visible } = this.props;

    if (driver === undefined) {
      return null;
    }

    const name = driver.modPack !== undefined ? driver.modPack.attributes['name'] : '';

    return (
      <Modal
        id='modpack-install-dialog'
        show={(driver.modPack !== undefined) && visible}
        onHide={undefined}
      >
        <Modal.Header>
          <Modal.Title>{t('Installing Modpack "{{name}}"', { replace: { name } })}</Modal.Title>
          {this.renderCurrentStep(driver.step)}
        </Modal.Header>
        <Modal.Body>
          {this.renderContent(driver.step)}
        </Modal.Body>
        <Modal.Footer>
          <Button
            style={{ display: driver.canClose() ? undefined : 'none' }}
            onClick={this.cancel}
          >
            {t('Close')}
          </Button>
          <Button style={{ display: driver.canHide() ? undefined : 'none' }} onClick={this.hide}>
            {t('Hide')}
          </Button>
          <Button disabled={!driver.canContinue()} onClick={this.next}>{t('Next')}</Button>
        </Modal.Footer>
      </Modal>
    );
  }

  private renderCurrentStep(step: Step): JSX.Element {
    const { t } = this.props;

    return (
      <Steps step={step}>
        <Steps.Step
          key='start'
          stepId='start'
          title={t('Start')}
          description={t('Introduction')}
        />
        <Steps.Step
          key='disclaimer'
          stepId='disclaimer'
          title={t('Disclaimer')}
          description={t('Disclaimer')}
        />
        <Steps.Step
          key='installing'
          stepId='installing'
          title={t('Installing')}
          description={t('Installing')}
        />
        <Steps.Step
          key='review'
          stepId='review'
          title={t('Review')}
          description={t('Installatino Results')}
        />
      </Steps>
    );
  }

  private renderContent(step: Step): JSX.Element {
    const { t, driver, i18n, isPremium, tReady } = this.props;

    if (driver.modPack === undefined) {
      return null;
    }

    switch (step) {
      case 'start': return (
        <InstallDialogStart t={t} isPremium={isPremium} driver={driver} />
      );
      case 'disclaimer': return (
        <InstallDialogDisclaimer t={t} driver={driver} />
      );
      case 'installing': return (
        <InstallDialogInstalling driver={driver} />
      );
      case 'review': return <InstallDialogReview t={t} driver={driver} />;
      default: return null;
    }
  }

  private hide = () => {
    this.props.onHide();
  }

  private cancel = () => {
    this.props.driver.cancel();
  }

  private next = () => {
    this.props.driver.continue();
  }
}

const emptyObject = {};

function mapStateToProps(state: types.IState): IConnectedProps {
  const { modId } = (state.session as any).modpack;
  const profile = selectors.activeProfile(state);
  const gameMode = profile !== undefined
    ? profile.gameId
    : undefined;

  if (modId !== undefined) {
    return {
      profile,
      mods: state.persistent.mods[gameMode],
      isPremium: util.getSafe(state, ['persistent', 'nexus', 'userInfo', 'isPremium'], false),
    };
  } else {
    return {
      profile,
      mods: emptyObject,
      isPremium: util.getSafe(state, ['persistent', 'nexus', 'userInfo', 'isPremium'], false),
    };
  }
}

function mapDispatchToProps(dispatch: Redux.Dispatch): IActionProps {
  return {
    onSetModAttribute: (gameId: string, modId: string, key: string, value: any) =>
      dispatch(actions.setModAttribute(gameId, modId, key, value)),
    onSetModAttributes: (gameId: string, modId: string, attributes: { [key: string]: any }) =>
      dispatch(actions.setModAttributes(gameId, modId, attributes)),
    onAddRule: (gameId: string, modId: string, rule: types.IModRule) =>
      dispatch(actions.addModRule(gameId, modId, rule)),
    onRemoveRule: (gameId: string, modId: string, rule: types.IModRule) =>
      dispatch(actions.removeModRule(gameId, modId, rule)),
  };
}

export default
  withTranslation(['common', 'modpack'])(
    connect(mapStateToProps, mapDispatchToProps)(
      InstallDialog) as any) as React.ComponentClass<IInstallDialogProps>;
