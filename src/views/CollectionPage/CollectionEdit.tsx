import { ICollectionInfo, ICollectionModRule } from '../../types/ICollection';
import { findModByRef } from '../../util/findModByRef';
import { getIniFiles, getInterface } from '../../util/gameSupport';
import InstallDriver from '../../util/InstallDriver';
import { makeBiDirRule } from '../../util/transformCollection';

import { NAMESPACE } from '../../constants';

import { startAddModsToCollection } from '../../actions/session';

import InfoPage from '../InfoPage';
import IniTweaks from '../IniTweaks';
import ModRules from '../ModRules';
import ModsEditPage from '../ModsEditPage';

import { IRevision } from '@nexusmods/nexus-api';
import * as React from 'react';
import { Badge, Panel, Tab, Tabs } from 'react-bootstrap';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { actions, ComponentEx, FlexLayout, tooltip, types, util } from 'vortex-api';

const INIT_PAGE = 'mods';

export interface ICollectionEditBaseProps {
  profile: types.IProfile;
  collection: types.IMod;
  mods: { [modId: string]: types.IMod };
  driver: InstallDriver;
  onRemove: (modId: string) => void;
  onUpload: (modId: string) => void;
}

interface IConnectedProps {
}

interface IActionProps {
  onSetModAttribute: (gameId: string, modId: string, key: string, value: any) => void;
  onSetModAttributes: (gameId: string, modId: string, attributes: { [key: string]: any }) => void;
  onAddRule: (gameId: string, modId: string, rule: types.IModRule) => void;
  onRemoveRule: (gameId: string, modId: string, rule: types.IModRule) => void;
  onAddModsDialog: (collectionId: string) => void;
}

type ICollectionEditProps = ICollectionEditBaseProps & IConnectedProps & IActionProps;

interface ICollectionEditState {
  page: string;
  collectionInfo: ICollectionInfo;
  collectionMods: { [modId: string]: types.IMod };
  collectionRules: ICollectionModRule[];
  revision: IRevision;
}

const emptyCollectionInfo: ICollectionInfo = {
  domainName: '',
  author: '',
  authorUrl: '',
  name: '',
  description: '',
};

class CollectionEdit extends ComponentEx<ICollectionEditProps, ICollectionEditState> {
  constructor(props: ICollectionEditProps) {
    super(props);

    this.initState({
      page: INIT_PAGE,
      collectionInfo: emptyCollectionInfo,
      collectionMods: {},
      collectionRules: [],
      revision: undefined,
    });
  }

  public componentDidMount() {
    this.updateState(this.props);
  }

  public UNSAFE_componentWillReceiveProps(newProps: ICollectionEditProps) {
    if (util.getSafe(newProps.collection, ['id'], undefined)
        !== util.getSafe(this.props.collection, ['id'], undefined)) {
      this.updateState(newProps);
    }
  }

  public render(): React.ReactNode {
    const { t, mods, collection, profile } = this.props;
    const { page, revision } = this.state;

    if (profile === undefined) {
      return null;
    }

    const game = util.getGame(profile.gameId);

    const iniFiles = getIniFiles(profile.gameId);
    const Interface = getInterface(profile.gameId);

    return (
      <FlexLayout type='column'>
        <FlexLayout.Fixed className='collection-edit-header'>
          <FlexLayout type='row'>
            <h3>{t('Edit Collection')} / {util.renderModName(collection)}</h3>
            <tooltip.IconButton
              icon='delete'
              tooltip={t('Remove this collection')}
              onClick={this.remove}
            >
              {t('Remove')}
            </tooltip.IconButton>
            <tooltip.IconButton
              icon='collection-export'
              tooltip={t('Upload to Nexus Mods')}
              onClick={this.upload}
            >
              {t('Upload')}
            </tooltip.IconButton>
          </FlexLayout>
          {t('Set up your mod collection\'s rules and site preferences.')}
        </FlexLayout.Fixed>
        <FlexLayout.Flex>
          <Tabs id='collection-edit-tabs' activeKey={page} onSelect={this.setCurrentPage}>
            {/*
            <Tab key='info' eventKey='info' title={t('Info')}>
              <Panel>
                <InfoPage
                  t={t}
                  collection={collection}
                  onSetCollectionInfo={this.setCollectionInfo}
                />
              </Panel>
            </Tab>
            */}
            <Tab
              key='mods'
              eventKey='mods'
              title={<div>{t('Mods')}<Badge>{(collection.rules || []).length}</Badge></div>}
            >
              <Panel style={{ position: 'relative' }}>
                <ModsEditPage
                  mods={mods}
                  collection={collection}
                  t={t}
                  onSetModVersion={null}
                  onAddRule={this.addRule}
                  onRemoveRule={this.removeRule}
                  onSetCollectionAttribute={this.setCollectionAttribute}
                  onAddModsDialog={this.addModsDialog}
                />
              </Panel>
            </Tab>
            <Tab key='mod-rules' eventKey='mod-rules' title={t('Mod Rules')}>
              <Panel>
                <ModRules
                  t={t}
                  collection={collection}
                  mods={mods}
                  rules={this.state.collectionRules}
                  onSetCollectionAttribute={this.setCollectionAttribute}
                />
              </Panel>
            </Tab>
            {((iniFiles || []).length > 0) ? (
              <Tab key='ini-tweaks' eventKey='ini-tweaks' title={t('Ini Tweaks')}>
                <Panel>
                  <IniTweaks modId={collection !== undefined ? collection.id : undefined} />
                </Panel>
              </Tab>
            ) : null}
            {!!Interface ? (
              <Tab key='gamespecific' eventKey='gamespecific' title={game.name}>
                <Panel>
                  <Interface t={t} collection={collection} revisionInfo={revision} />
                </Panel>
              </Tab>
            ) : null}
          </Tabs>
        </FlexLayout.Flex>
      </FlexLayout>
    );
  }

  private async updateState(props: ICollectionEditProps) {
    this.nextState.page = INIT_PAGE;
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
      this.nextState.collectionMods = includedMods;
      this.nextState.collectionRules = Object.values(includedMods)
        .reduce((prev, mod: types.IMod) => {
          prev = [].concat(prev, (mod.rules || []).map(rule => makeBiDirRule(mod, rule)));
          return prev;
        }, []);

      if (collection.attributes?.revisionId !== undefined) {
        this.nextState.revision = await
          this.props.driver.infoCache.getRevisionInfo(collection.attributes.revisionId);
      }
    }
  }

  private setCurrentPage = (page: any) => {
    this.nextState.page = page;
  }

  private remove = () => {
    const { collection, onRemove } = this.props;
    onRemove(collection.id);
  }

  private upload = () => {
    const { collection, onUpload } = this.props;
    onUpload(collection.id);
  }

  private addRule = (rule: types.IModRule) => {
    const { profile, collection } = this.props;
    this.props.onAddRule(profile.gameId, collection.id, rule);
  }

  private removeRule = (rule: types.IModRule) => {
    const { profile, collection } = this.props;
    this.props.onRemoveRule(profile.gameId, collection.id, rule);
  }

  private setCollectionAttribute = (attrPath: string[], value: any) => {
    const { profile, collection } = this.props;
    const attr = util.getSafe(collection.attributes, ['collection'], {});
    this.props.onSetModAttribute(profile.gameId, collection.id, 'collection',
      util.setSafe(attr, attrPath, value));
  }

  private addModsDialog = (collectionId: string) => {
    this.props.onAddModsDialog(collectionId);
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
    onAddModsDialog: (collectionId: string) =>
      dispatch(startAddModsToCollection(collectionId)),
  };
}

export default
  withTranslation([NAMESPACE, 'common'])(
    connect(mapStateToProps, mapDispatchToProps)(
      CollectionEdit) as any) as React.ComponentClass<ICollectionEditBaseProps>;
