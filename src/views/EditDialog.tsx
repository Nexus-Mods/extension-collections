import { IModPackInfo, IModPackMod, IModPackModRule } from '../types/IModPack';
import { findModByRef } from '../util/findModByRef';
import { getIniFiles } from '../util/gameSupport';
import { makeBiDirRule } from '../util/modpack';

import { NAMESPACE } from '../constants';

import InfoPage from './InfoPage';
import IniTweaks from './IniTweaks';
import ModRules from './ModRules';
import ModsPage from './ModsPage';

import * as path from 'path';
import * as React from 'react';
import { Button, Modal, Tab, Tabs } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { actions, ComponentEx, fs, selectors, types, util } from 'vortex-api';

export interface IEditDialogProps {
  onClose: () => void;
  onExport: (modpackId: string) => void;
}

interface IConnectedProps {
  profile: types.IProfile;
  gameMode: string;
  modpack: types.IMod;
  mods: { [modId: string]: types.IMod };
}

interface IActionProps {
  onSetModAttribute: (gameId: string, modId: string, key: string, value: any) => void;
  onSetModAttributes: (gameId: string, modId: string, attributes: { [key: string]: any }) => void;
  onAddRule: (gameId: string, modId: string, rule: types.IModRule) => void;
  onRemoveRule: (gameId: string, modId: string, rule: types.IModRule) => void;
}

type IProps = IEditDialogProps & IConnectedProps & IActionProps;

interface IEditDialogState {
  page: string;
  modPackInfo: IModPackInfo;
  modPackMods: { [modId: string]: types.IMod };
  modPackRules: IModPackModRule[];
}

class EditDialog extends ComponentEx<IProps, IEditDialogState> {
  constructor(props: IProps) {
    super(props);

    this.initState({
      page: 'info',
      modPackInfo: emptyModPackInfo,
      modPackMods: {},
      modPackRules: [],
    });
  }

  public componentWillReceiveProps(newProps: IProps) {
    if (util.getSafe(newProps.modpack, ['id'], undefined)
        !== util.getSafe(this.props.modpack, ['id'], undefined)) {
      this.nextState.page = 'info';
      if (newProps.modpack !== undefined) {
        const {modpack, mods} = newProps;

        const includedMods: { [modId: string]: types.IMod } = modpack.rules
          .filter(rule => rule.type === 'requires')
          .reduce((prev, rule) => {
            const mod = findModByRef(rule.reference, mods);
            if (mod !== undefined) {
              prev[mod.id] = mod;
            }
            return prev;
          }, {});
        this.nextState.modPackMods = includedMods;
        this.nextState.modPackRules = Object.values(includedMods)
          .reduce((prev, mod: types.IMod) => {
            prev = [].concat(prev, (mod.rules || []).map(rule => makeBiDirRule(mod, rule)));
            return prev;
          }, []);
      }
    }
  }

  public render(): React.ReactNode {
    const { t, mods, modpack, profile } = this.props;
    const { page } = this.state;

    if (profile === undefined) {
      return null;
    }

    const name = modpack !== undefined ? modpack.attributes['name'] : '';

    const iniFiles = getIniFiles(profile.gameId);

    return (
      <Modal id='modpack-edit-dialog' show={modpack !== undefined} onHide={undefined}>
        <Modal.Header>
          <Modal.Title>{t('Edit Modpack "{{name}}"', { replace: { name } })}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Tabs id='modpack-edit-tabs' activeKey={page} onSelect={this.setCurrentPage}>
            <Tab key='info' eventKey='info' title={t('Info')}>
              <InfoPage
                t={t}
                modpack={modpack}
                onSetModPackInfo={this.setModPackInfo}
              />
            </Tab>
            <Tab key='mods' eventKey='mods' title={t('Mods')}>
              <ModsPage
                mods={mods}
                modpack={modpack}
                t={t}
                onSetModVersion={null}
                onAddRule={this.addRule}
                onRemoveRule={this.removeRule}
                onSetModpackAttribute={this.setModpackAttribute}
              />
            </Tab>
            <Tab key='mod-rules' eventKey='mod-rules' title={t('Mod Rules')}>
              <ModRules t={t} modpack={modpack} mods={mods} rules={this.state.modPackRules} />
            </Tab>
            {(iniFiles.length > 0) ? (
              <Tab key='ini-tweaks' eventKey='ini-tweaks' title={t('Ini Tweaks')}>
                <IniTweaks modId={modpack !== undefined ? modpack.id : undefined} />
              </Tab>
            ) : null}
            <Tab key='export' eventKey='export' title={t('Export')}>
              {this.renderExport()}
            </Tab>
          </Tabs>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={this.hide}>{t('Close')}</Button>
        </Modal.Footer>
      </Modal>
    );
  }

  private renderExport(): React.ReactNode {
    const { t } = this.props;
    return (
      <div className='modpack-edit-export'>
        <Button onClick={this.export}>
          {t('Export to file')}
        </Button>
        <Button disabled={true}>
          {t('Upload to NexusMods')}
        </Button>
      </div>
    );
  }

  private setModPackInfo = (key: string, value: any) => {
    const { gameMode, modpack, onSetModAttributes } = this.props;
    onSetModAttributes(gameMode, modpack.id, { [key]: value });
  }

  private setCurrentPage = (page: any) => {
    this.nextState.page = page;
  }

  private genName = () => {
    const { modPackInfo } = this.state;

    return `${modPackInfo.name} v${modPackInfo.version}.vmp`;
  }

  private export = () => {
    const { modpack, onClose, onExport } = this.props;
    onExport(modpack.id);
    onClose();
  }

  private addRule = (rule: types.IModRule) => {
    const { gameMode, modpack } = this.props;
    this.props.onAddRule(gameMode, modpack.id, rule);
  }

  private removeRule = (rule: types.IModRule) => {
    const { gameMode, modpack } = this.props;
    this.props.onRemoveRule(gameMode, modpack.id, rule);
  }

  private setModpackAttribute = (attrPath: string[], value: any) => {
    const { gameMode, modpack } = this.props;
    const attr = util.getSafe(modpack.attributes, ['modpack'], {});
    this.props.onSetModAttribute(gameMode, modpack.id, 'modpack',
      util.setSafe(attr, attrPath, value));
  }

  private hide = () => {
    this.props.onClose();
  }
}

const emptyObject = {};

const emptyModPackInfo: IModPackInfo = {
  game_id: '',
  author: '',
  author_url: '',
  name: '',
  description: '',
  version: '',
};

function mapStateToProps(state: any): IConnectedProps {
  const { modId } = state.session.modpack;
  const profile = selectors.activeProfile(state);
  const gameMode = profile !== undefined
    ? profile.gameId
    : undefined;

  if (modId !== undefined) {
    const modpack = state.persistent.mods[gameMode][modId];
    return {
      profile,
      gameMode,
      modpack,
      mods: state.persistent.mods[gameMode],
    };
  } else {
    return {
      profile,
      gameMode,
      modpack: undefined,
      mods: emptyObject,
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
  withTranslation(['common', NAMESPACE])(
    connect(mapStateToProps, mapDispatchToProps)(
      EditDialog) as any) as React.ComponentClass<IEditDialogProps>;
