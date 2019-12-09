import { IModPackInfo, IModPackMod, IModPackModRule } from '../../types/IModPack';
import { findModByRef } from '../../util/findModByRef';
import { getIniFiles } from '../../util/gameSupport';
import { makeBiDirRule } from '../../util/modpack';

import { NAMESPACE } from '../../constants';

import InfoPage from '../InfoPage';
import IniTweaks from '../IniTweaks';
import ModRules from '../ModRules';
import ModsPage from '../ModsPage';

import I18next from 'i18next';
import * as path from 'path';
import * as React from 'react';
import { Button, Modal, Tab, Tabs, Panel, Badge } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { actions, ComponentEx, fs, selectors, types, util, FlexLayout } from 'vortex-api';


export interface ICollectionEditBaseProps {
  profile: types.IProfile;
  collection: types.IMod;
  mods: { [modId: string]: types.IMod };
}

interface IConnectedProps {
}

interface IActionProps {
  onSetModAttribute: (gameId: string, modId: string, key: string, value: any) => void;
  onSetModAttributes: (gameId: string, modId: string, attributes: { [key: string]: any }) => void;
  onAddRule: (gameId: string, modId: string, rule: types.IModRule) => void;
  onRemoveRule: (gameId: string, modId: string, rule: types.IModRule) => void;
}

type ICollectionEditProps = ICollectionEditBaseProps & IConnectedProps & IActionProps;

interface ICollectionEditState {
  page: string;
  modPackInfo: IModPackInfo;
  modPackMods: { [modId: string]: types.IMod };
  modPackRules: IModPackModRule[];
}


const emptyCollectionInfo: IModPackInfo = {
  game_id: '',
  author: '',
  author_url: '',
  name: '',
  description: '',
  version: '',
};

class CollectionEdit extends ComponentEx<ICollectionEditProps, ICollectionEditState> {
  constructor(props: ICollectionEditProps) {
    super(props);

    this.initState({
      page: 'info',
      modPackInfo: emptyCollectionInfo,
      modPackMods: {},
      modPackRules: [],
    });
  }

  public componentDidMount() {
    this.updateState(this.props);
  }

  public componentWillReceiveProps(newProps: ICollectionEditProps) {
    if (util.getSafe(newProps.collection, ['id'], undefined)
        !== util.getSafe(this.props.collection, ['id'], undefined)) {
      this.updateState(newProps);
    }
  }

  public render(): React.ReactNode {
    const { t, mods, collection, profile } = this.props;
    const { page } = this.state;

    if (profile === undefined) {
      return null;
    }

    const name = collection !== undefined ? collection.attributes['name'] : '';

    const iniFiles = getIniFiles(profile.gameId);

    return (
      <FlexLayout type='column'>
        <FlexLayout.Fixed className='collection-edit-header'>
          <h3>{t('Edit Collection')} / {util.renderModName(collection)}</h3>
          {t('Set up your mod collection\'s rules and site preferences.')}
        </FlexLayout.Fixed>
        <FlexLayout.Flex>
          <Tabs id='modpack-edit-tabs' activeKey={page} onSelect={this.setCurrentPage}>
            <Tab key='info' eventKey='info' title={t('Info')}>
              <Panel>
                <InfoPage
                  t={t}
                  modpack={collection}
                  onSetModPackInfo={this.setModPackInfo}
                />
              </Panel>
            </Tab>
            <Tab key='mods' eventKey='mods' title={<div>{t('Mods')}<Badge>{Object.keys(mods).length}</Badge></div>}>
              <Panel>
                <ModsPage
                  mods={mods}
                  modpack={collection}
                  t={t}
                  onSetModVersion={null}
                  onAddRule={this.addRule}
                  onRemoveRule={this.removeRule}
                  onSetModpackAttribute={this.setModpackAttribute}
                />
              </Panel>
            </Tab>
            <Tab key='mod-rules' eventKey='mod-rules' title={t('Mod Rules')}>
              <Panel>
                <ModRules t={t} modpack={collection} mods={mods} rules={this.state.modPackRules} />
              </Panel>
            </Tab>
            {(iniFiles.length > 0) ? (
              <Tab key='ini-tweaks' eventKey='ini-tweaks' title={t('Ini Tweaks')}>
                <Panel>
                  <IniTweaks modId={collection !== undefined ? collection.id : undefined} />
                </Panel>
              </Tab>
            ) : null}
          </Tabs>
        </FlexLayout.Flex>
      </FlexLayout>
    );
  }

  private updateState(props: ICollectionEditProps) {
    this.nextState.page = 'info';
    if (props.collection !== undefined) {
      const { collection, mods } = props;

      const includedMods: { [modId: string]: types.IMod } = collection.rules
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

  private setModPackInfo = (key: string, value: any) => {
    const { profile, collection, onSetModAttributes } = this.props;
    onSetModAttributes(profile.gameId, collection.id, { [key]: value });
  }

  private setCurrentPage = (page: any) => {
    this.nextState.page = page;
  }

  private addRule = (rule: types.IModRule) => {
    const { profile, collection } = this.props;
    this.props.onAddRule(profile.gameId, collection.id, rule);
  }

  private removeRule = (rule: types.IModRule) => {
    const { profile, collection } = this.props;
    this.props.onRemoveRule(profile.gameId, collection.id, rule);
  }

  private setModpackAttribute = (attrPath: string[], value: any) => {
    const { profile, collection } = this.props;
    const attr = util.getSafe(collection.attributes, ['modpack'], {});
    this.props.onSetModAttribute(profile.gameId, collection.id, 'modpack',
      util.setSafe(attr, attrPath, value));
  }
}

function mapStateToProps(state: any, ownProps: ICollectionEditBaseProps): IConnectedProps {
  return {
  };
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
  withTranslation([NAMESPACE, 'common'])(
    connect(mapStateToProps, mapDispatchToProps)(
      CollectionEdit) as any) as React.ComponentClass<ICollectionEditBaseProps>;
