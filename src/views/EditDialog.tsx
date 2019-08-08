import { IModPackInfo, IModPackMod, IModPackModRule } from '../types/IModPack';
import { generateModPack, initModPackMod, makeBiDirRule } from '../util/modpack';

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
import { actions, ComponentEx, fs, selectors, Steps, types, util } from 'vortex-api';

function findModByRef(reference: types.IReference, state: types.IState): string {
  // TODO: support non-hash references
  const gameMode = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameMode];
  const existing: string = Object.keys(mods).find((modId: string): boolean => {
    return util.getSafe(mods[modId], ['attributes', 'fileMD5'], undefined) === reference.fileMD5;
  });
  return existing;
}

export interface IEditDialogProps {
  onClose: () => void;
}

interface IConnectedProps {
  profile: types.IProfile;
  gameMode: string;
  modpack: types.IMod;
  mods: { [modId: string]: types.IMod };
}

interface IActionProps {
  onSetModAttributes: (gameId: string, modId: string, attributes: { [key: string]: any }) => void;
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
    if (newProps.modpack !== this.props.modpack) {
      this.nextState.page = 'info';
      if (newProps.modpack !== undefined) {
        const {modpack, mods} = newProps;

        const includedMods: { [modId: string]: types.IMod } = modpack.rules
          .filter(rule => rule.type === 'requires')
          .reduce((prev, rule) => {
            const modId = findModByRef(rule.reference, this.context.api.store.getState());
            prev[modId] = mods[modId];
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

    const name = modpack !== undefined ? modpack.attributes['name'] : '';

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
                mod={modpack}
                onSetModPackInfo={this.setModPackInfo}
              />
            </Tab>
            <Tab key='mods' eventKey='mods' title={t('Mods')}>
              <ModsPage
                profile={profile}
                mods={mods}
                t={t}
                onSetModVersion={null}
              />
            </Tab>
            <Tab key='mod-rules' eventKey='mod-rules' title={t('Mod Rules')}>
              <ModRules t={t} mods={mods} rules={this.state.modPackRules} />
            </Tab>
            {this.isGamebryoGame() ? (
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

  private isGamebryoGame(): boolean {
    const { gameMode } = this.props;
    return [
      'fallout3', 'falloutnv', 'fallout4', 'fallout4vr',
      'oblivion', 'skyrim', 'skyrimse', 'skyrimvr',
    ].indexOf(gameMode) !== -1;
  }

  private renderExport(): React.ReactNode {
    const { t } = this.props;
    return (
      <div className='modpack-edit-export'>
        <Button onClick={this.export}>
          {t('Export to file')}
        </Button>
      </div>
    );
  }

  private setModPackInfo = (key: string, value: any) => {
    const { gameMode, modpack, onSetModAttributes } = this.props;
    onSetModAttributes(gameMode, modpack.id, { [key]: value });
    // this.nextState.modPackInfo[key] = value;
  }

  private setCurrentPage = (page: any) => {
    this.nextState.page = page;
  }

  private genName = () => {
    const { modPackInfo } = this.state;

    return `${modPackInfo.name} v${modPackInfo.version}.vmp`;
  }

  private export = () => {
    const { t } = this.props;
    const { modPackInfo, modPackMods } = this.state;
    this.context.api.selectDir({
      title: t('Select folder to save modpack to'),
    } as any)
      .then(modpackPath => {
        const outputPath = path.join(modpackPath, this.genName());
        const modPackData = generateModPack(modPackInfo,
            Object.values(modPackMods).map(mod => initModPackMod(mod)), []);
        return fs.writeFileAsync(outputPath,
          JSON.stringify(modPackData, undefined, 2));
        });
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
  const gameMode = profile.gameId;

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
    onSetModAttributes: (gameId: string, modId: string, attributes: { [key: string]: any }) =>
      dispatch(actions.setModAttributes(gameId, modId, attributes)),
  };
}

export default
  withTranslation(['common'])(
    connect(mapStateToProps, mapDispatchToProps)(
      EditDialog) as any) as React.ComponentClass<{}>;
