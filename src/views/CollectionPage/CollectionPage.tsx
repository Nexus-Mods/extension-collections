import { AUTHOR_UNKNOWN } from '../../constants';
import { findDownloadIdByRef, findModByRef, testDownloadReference } from '../../util/findModByRef';

import { IModEx } from '../../types/IModEx';

import CollectionItemStatus from './CollectionItemStatus';
import CollectionOverview from './CollectionOverview';
import CollectionProgress, { ICollectionProgressProps } from './CollectionProgress';

import * as Promise from 'bluebird';
import i18next from 'i18next';
import * as _ from 'lodash';
import * as React from 'react';
import { Image, Nav, NavItem, Panel } from 'react-bootstrap';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { actions, ComponentEx, FlexLayout, ITableRowAction, OptionsFilter, Table,
         TableTextFilter, types, util } from 'vortex-api';

export interface ICollectionPageProps {
  t: i18next.TFunction;
  className: string;
  profile: types.IProfile;
  collection: types.IMod;
  mods: { [modId: string]: types.IMod };
  downloads: { [dlId: string]: types.IDownload };
  notifications: types.INotification[];
  onView: (modId: string) => void;
}

interface IConnectedProps {

}

interface IActionProps {
  onSetModEnabled: (profileId: string, modId: string, enabled: boolean) => void;
  onRemoveRule: (gameId: string, modId: string, rule: types.IModRule) => void;
}

interface IComponentState {
  modsEx: { [modId: string]: IModEx };
}

const getCollator = (() => {
  let collator: Intl.Collator;
  let language: string;

  return (locale: string): Intl.Collator => {
    if ((collator === undefined) || (locale !== language)) {
      language = locale;
      collator = new Intl.Collator(locale, { sensitivity: 'base' });
    }
    return collator;
  };
})();

type IProps = ICollectionPageProps & IConnectedProps & IActionProps;

class CollectionPage extends ComponentEx<IProps, IComponentState> {
  private mAttributes: Array<types.ITableAttribute<IModEx>>;
  private mUpdateDebouncer: util.Debouncer;
  private mModActions: ITableRowAction[];

  constructor(props: IProps) {
    super(props);
    this.initState({
      modsEx: {},
    });

    this.mModActions = [
      {
        icon: 'checkbox-checked',
        title: 'Enable',
        action: this.enableSelected,
        singleRowAction: false,
      },
      {
        icon: 'checkbox-unchecked',
        title: 'Disable',
        action: this.disableSelected,
        singleRowAction: false,
      },
      {
        icon: 'delete',
        title: 'Remove',
        action: this.removeSelected,
        condition: instanceId => (typeof(instanceId) === 'string')
            ? (['downloaded', 'installed']
                .indexOf(this.state.modsEx[instanceId].state) !== -1)
            : true,
        hotKey: { code: 46 },
      },
    ];

    this.mAttributes = [
      {
        id: 'collection_status',
        name: 'Status',
        description: 'Is mod enabled in current profile',
        icon: 'check-o',
        position: 500,
        customRenderer: (mod: IModEx) => {
          const download = (mod.archiveId !== undefined)
            ? this.props.downloads[mod.archiveId]
            : undefined;
          return (
            <CollectionItemStatus
              t={this.props.t}
              mod={mod}
              notifications={this.props.notifications}
              download={download}
            />
          );
        },
        calc: (mod: IModEx) => {
          if (mod.state === 'installing') {
            return 'Installing';
          } else if (mod.state === 'downloading') {
            return 'Downloading';
          } else if ((mod.state === null) || (mod.state === 'downloaded')) {
            return 'Pending';
          }
          return mod.enabled === true ? 'Enabled' : 'Disabled';
        },
        placement: 'table',
        isToggleable: false,
        edit: {},
        noShrink: true,
        isSortable: false,
        filter: new OptionsFilter([
          { value: 'Enabled', label: 'Enabled' },
          { value: 'Disabled', label: 'Disabled' },
          { value: 'Installing', label: 'Installing' },
          { value: 'Downloading', label: 'Downloading' },
          { value: 'Pending', label: 'Pending' },
        ], true, false),
      } as any,
      {
        id: 'name',
        name: 'Name',
        calc: mod => (mod.state !== null)
          ? (util.renderModReference as any)(mod.collectionRule.reference, mod, { version: false })
          : (util.renderModReference as any)(mod.collectionRule.reference,
                                             undefined, { version: false }),
        placement: 'table',
        edit: {},
        isToggleable: false,
        isDefaultSort: true,
        isSortable: true,
        filter: new TableTextFilter(true),
        sortFunc: (lhs: string, rhs: string, locale: string): number =>
          getCollator(locale).compare(lhs, rhs),
      },
      {
        id: 'version',
        name: 'Version',
        calc: mod => (mod.state !== null)
          ? util.getSafe(mod.attributes, ['version'], '0.0.0')
          : mod.collectionRule.reference.versionMatch,
        placement: 'table',
        edit: {},
      },
      {
        id: 'author',
        name: 'Author',
        customRenderer: (mod: IModEx) => (mod !== undefined)
          ? (
            <div>
              <Image circle src='assets/images/noavatar.png' />
              {util.getSafe(mod.attributes, ['author'], undefined) || this.props.t(AUTHOR_UNKNOWN)}
            </div>
          ) : (
            <div>
              <Image circle src='assets/images/noavatar.png' />
              {this.props.t(AUTHOR_UNKNOWN)}
            </div>
          ),
        calc: mod => (mod !== undefined)
          ? util.getSafe(mod.attributes, ['author'], undefined) || this.props.t(AUTHOR_UNKNOWN)
          : this.props.t(AUTHOR_UNKNOWN),
        placement: 'table',
        edit: {},
        isToggleable: true,
        isSortable: true,
      },
      {
        id: 'size',
        name: 'Size',
        calc: mod => util.bytesToString(util.getSafe(mod, ['attributes', 'fileSize'], 0)),
        placement: 'table',
        edit: {},
        isSortable: true,
        sortFuncRaw: (lhs, rhs) =>
          util.getSafe(lhs, ['attributes', 'fileSize'], 0)
          - util.getSafe(rhs, ['attributes', 'fileSize'], 0),
      },
    ];
  }

  public componentWillMount() {
    this.nextState.modsEx = this.initModsEx(this.props);
  }

  public componentWillReceiveProps(newProps: ICollectionPageProps) {
    if ((this.props.mods !== newProps.mods)
        || (this.props.profile !== newProps.profile)
        || (this.props.collection !== newProps.collection)
        || (this.props.downloads !== newProps.downloads)
        || this.installingNotificationsChanged(this.props, newProps)) {
      this.nextState.modsEx = this.updateModsEx(this.props, newProps);
    }
  }

  public shouldComponentUpdate(newProps: ICollectionPageProps) {
    if ((this.props.mods !== newProps.mods)
        || (this.props.profile !== newProps.profile)
        || (this.props.downloads !== newProps.downloads)
        || (this.props.collection !== newProps.collection)
        || this.installingNotificationsChanged(this.props, newProps)) {
      return true;
    }
    return false;
  }

  public render(): JSX.Element {
    const { t, className, collection, downloads, profile } = this.props;
    const { modsEx } = this.state;

    if (collection === undefined) {
      return null;
    }

    const totalSize = Object.values(modsEx).reduce((prev, mod) => {
      const size = util.getSafe(mod, ['attributes', 'fileSize'], 0);
      return prev + size;
    }, 0);

    const modsFinal = Object.keys(modsEx).reduce((prev, modId) => {
      if (modsEx[modId].state !== 'installed') {
        prev[modId] = {
          ...modsEx[modId],
          progress: this.progress(modsEx[modId]),
        };
      } else {
        prev[modId] = modsEx[modId];
      }

      return prev;
    }, {});

    return (
      <FlexLayout type='column' className={className}>
        <FlexLayout.Fixed>
          <CollectionOverview
            t={t}
            gameId={profile.gameId}
            collection={collection}
            totalSize={totalSize}
            onClose={this.close}
          />
        </FlexLayout.Fixed>
        <FlexLayout.Flex fill={true} className='collection-mods-panel'>
          <Panel>
            <Panel.Body>
              <Table
                tableId='mods'
                showDetails={true}
                data={modsFinal}
                staticElements={this.mAttributes}
                actions={this.mModActions}
              />
            </Panel.Body>
          </Panel>
        </FlexLayout.Flex>
        <FlexLayout.Fixed>
          <Panel>
            <CollectionProgress
              t={t}
              mods={modsEx}
              downloads={downloads}
              totalSize={totalSize}
              onCancel={() => null}
              onPause={() => null}
            />
          </Panel>
        </FlexLayout.Fixed>
      </FlexLayout>
    );
  }

  private progress(mod: IModEx) {
    const { downloads, notifications } = this.props;

    if (mod.state === 'downloading') {
      const { received, size } = downloads[mod.archiveId];
      return received / size;
    } else if (mod.state === 'installing') {
      const notification = notifications.find(noti => noti.id === 'install_' + mod.id);
      if (notification !== undefined) {
        return notification.progress / 100;
      } else {
        return 1;
      }
    }

    return 0;
  }

  private close = () => {
    this.props.onView(undefined);
  }

  private installingNotificationsChanged(oldProps: ICollectionPageProps,
                                         newProps: ICollectionPageProps): boolean {
    if (oldProps.notifications !== newProps.notifications) {
      const oldInstalling = oldProps.notifications
        .filter(noti => noti.id.startsWith('install_'));
      const newInstalling = newProps.notifications
        .filter(noti => noti.id.startsWith('install_'));

      return !_.isEqual(oldInstalling, newInstalling);
    } else {
      return false;
    }
  }

  private ruleId(input: types.IModRule): string {
    return input.type + '_' + (
      input.reference.fileMD5
      || input.reference.id
      || input.reference.logicalFileName
      || input.reference.fileExpression
      || input.reference.description
    );
  }

  private enableSelected = (modIds: string[]) => {
    const { profile, onSetModEnabled } = this.props;

    modIds.forEach((key: string) => {
      if (!util.getSafe(profile.modState, [key, 'enabled'], false)) {
        onSetModEnabled(profile.id, key, true);
      }
    });
    this.context.api.events.emit('mods-enabled', modIds, true, profile.gameId);
  }

  private disableSelected = (modIds: string[]) => {
    const { profile, onSetModEnabled } = this.props;

    modIds.forEach((key: string) => {
      if (util.getSafe(profile.modState, [key, 'enabled'], false)) {
        onSetModEnabled(profile.id, key, false);
      }
    });
    this.context.api.events.emit('mods-enabled', modIds, false, profile.gameId);
  }

  private removeSelected = (modIds: string[]) => {
    const { t, collection, profile, onRemoveRule } = this.props;
    const { modsEx } = this.state;

    const filteredIds = modIds
      .filter(modId => modsEx[modId] !== undefined)
      .filter(modId =>
        ['downloaded', 'installed', null].indexOf(modsEx[modId].state) !== -1);

    if (filteredIds.length === 0) {
      return;
    }

    const modNames = filteredIds
      .map(modId => (modsEx[modId].state !== null)
        ? util.renderModName(modsEx[modId], { version: true })
        : util.renderModReference(modsEx[modId].collectionRule.reference, undefined));

    const checkboxes = [
      { id: 'mod', text: t('Remove Mod'), value: true },
      { id: 'archive', text: t('Delete Archive'), value: false },
      { id: 'collection', text: t('Remove from Collection'), value: false },
    ];

    this.context.api.showDialog('question', 'Confirm removal', {
      text: t('Do you really want to remove this mod?', {
        count: filteredIds.length,
        replace: { count: filteredIds.length },
      }),
      message: modNames.join('\n'),
      checkboxes,
    }, [ { label: 'Cancel' }, { label: 'Remove' } ])
      .then((result: types.IDialogResult) => {
        const removeMods = result.action === 'Remove' && result.input.mod;
        const removeArchive = result.action === 'Remove' && result.input.archive;
        const removeRule = result.action === 'Remove' && result.input.collection;

        const wereInstalled = filteredIds
          .filter(key => (modsEx[key] !== undefined) && (modsEx[key].state === 'installed'))
          .map(key => modsEx[key].id);

        const archiveIds = filteredIds
          .filter(key => (modsEx[key] !== undefined)
                      && (['downloaded', 'installed'].includes(modsEx[key].state))
                      && (modsEx[key].archiveId !== undefined))
          .map(key => modsEx[key].archiveId);

        const rulesToRemove = filteredIds.filter(key => modsEx[key] !== undefined);

        return (removeMods
            ? (util as any).removeMods(this.context.api, profile.gameId, wereInstalled)
            : Promise.resolve())
          .then(() => {
            if (removeArchive) {
              archiveIds.forEach(archiveId => {
                this.context.api.events.emit('remove-download', archiveId);
              });
            }
            return Promise.resolve();
          })
          .then(() => {
            if (removeRule) {
              rulesToRemove.forEach(key => {
                onRemoveRule(profile.gameId, collection.id, modsEx[key].collectionRule);
              });
            }
          });
      })
      .catch(util.ProcessCanceled, err => {
        this.context.api.sendNotification({
          id: 'cant-remove-mod',
          type: 'warning',
          title: 'Failed to remove mods',
          message: err.message,
        });
      })
      .catch(util.UserCanceled, () => null)
      .catch(err => {
        this.context.api.showErrorNotification('Failed to remove selected mods', err);
      });
  }

  private updateModsEx(oldProps: ICollectionPageProps,
                       newProps: ICollectionPageProps)
                       : { [modId: string]: IModEx } {
    // keep our cache updated
    const result = { ...this.state.modsEx };

    const modifiedDownloads: { [dlId: string]: types.IDownload }
      = util.objDiff(oldProps.downloads, newProps.downloads);

    const modifiedMods: { [modId: string]: types.IMod }
      = util.objDiff(oldProps.mods, newProps.mods);

    const genRuleMap = (rules: types.IModRule[]) => {
      return (rules || []).reduce((prev, rule) => {
        prev[this.ruleId(rule)] = rule;
        return prev;
      }, {});
    };

    const modifiedRules: { [ruleId: string]: types.IModRule }
      = util.objDiff(genRuleMap(oldProps.collection.rules), genRuleMap(newProps.collection.rules));

    const needRefresh: Set<string> = new Set<string>();

    // remove any cache entry where the download or the mod has been
    // removed or changed
    Object.keys(modifiedDownloads)
      .filter(dlId => dlId.startsWith('-'))
      .forEach(dlId => {
        const refId = Object.keys(result).find(iter => result[iter].archiveId === dlId.slice(1));
        if (refId !== undefined) {
          needRefresh.add(refId);
        }
      });

    Object.keys(modifiedMods)
      .filter(modId => modId.startsWith('-'))
      .forEach(modId => {
        const realId = modId.slice(1);
        const refId = Object.keys(result).find(iter => result[iter].id === realId);
        if (refId !== undefined) {
          needRefresh.add(refId);
        }
      });

    // refresh removed or changed entries
    needRefresh.forEach(refId => {
      const rule = result[refId].collectionRule;
      delete result[refId];

      result[refId] = this.modFromRule(newProps, rule);
    });

    Object.keys(modifiedRules)
      .forEach(ruleId => {
        if (ruleId.startsWith('-')) {
          delete result[ruleId.slice(1)];
        } else if (ruleId.startsWith('+')) {
          result[ruleId.slice(1)] = this.modFromRule(newProps, modifiedRules[ruleId]);
        }
      });

    const { profile } = newProps;
    const { modsEx } = this.state;
    const pendingDL = Object.keys(modsEx).filter(modId => modsEx[modId].state === null);
    const pendingInstall = Object.keys(modsEx)
      .filter(modId => ['downloading', 'downloaded', null].includes(modsEx[modId].state));
    const pendingFinish = Object.keys(modsEx)
      .filter(modId => ['installing', 'installed'].includes(modsEx[modId].state));

    // now, also check every added download or mod whether they may be relevant for any unfulfilled
    // rule
    Object.keys(modifiedDownloads)
      .filter(dlId => dlId.startsWith('+'))
      .forEach(dlId => {
        const match = pendingDL.find(modId =>
          testDownloadReference(modifiedDownloads[dlId], modsEx[modId].collectionRule.reference));
        if (match !== undefined) {
          result[match] = this.modFromDownload(dlId.slice(1),
                                               modifiedDownloads[dlId],
                                               modsEx[match].collectionRule);
        }
      });

    Object.keys(modifiedMods)
      .filter(modId => !modId.startsWith('-')
                    && (modId.startsWith('+')
                        || (modifiedMods[modId]['+state'] !== undefined)
                        || (modifiedMods[modId]['attributes'] !== undefined)))
      .forEach(modId => {
        const realId = modId.startsWith('+') ? modId.slice(1) : modId;
        const mod = newProps.mods[realId];
        if (mod === undefined) {
          return;
        }
        if (mod.state === 'installing') {
          // in this state the mod doesn't contain enough information to match a reference, go
          // through the download instead
          const dlId = mod.archiveId;
          const download = newProps.downloads[dlId];
          const match = pendingInstall.find(iter =>
            testDownloadReference(download, modsEx[iter].collectionRule.reference));
          if (match !== undefined) {
            result[match] = {
              ...this.modFromDownload(dlId, download, modsEx[match].collectionRule),
              id: modId.slice(1),
              state: 'installing',
            };
          }
        } else {
          const match = pendingFinish.find(iter =>
            util.testModReference(mod, modsEx[iter].collectionRule.reference));
          if (match !== undefined) {
            result[match] = {
              ...mod,
              ...profile.modState[mod.id],
              collectionRule: modsEx[match].collectionRule,
            };
          }
        }
      });

    return result;
  }

  private modFromDownload(dlId: string, download: types.IDownload, rule: types.IModRule): IModEx {
    return {
      id: dlId,
      type: '',
      installationPath: undefined,
      archiveId: dlId,
      state: download.state === 'finished' ? 'downloaded' : 'downloading',
      enabled: false,
      collectionRule: rule,
      attributes: {
        customFileName: download.modInfo.name,
        fileName: download.localPath,
        fileSize: download.size,
        received: download.received,
        name: dlId,
      },
    };
  }

  private modFromRule(props: ICollectionPageProps, rule: types.IModRule): IModEx {
    const { downloads, mods, profile } = props;

    const mod: types.IMod = findModByRef(rule.reference, mods);

    if (mod !== undefined) {
      return {
        ...mods[mod.id],
        ...profile.modState[mod.id],
        collectionRule: rule,
      };
    } else {
      const dlId: string = findDownloadIdByRef(rule.reference, downloads);

      if (dlId !== undefined) {
        return this.modFromDownload(dlId, downloads[dlId], rule);
      } else {
        // not downloaded and not installed yet
        const name = util.renderModReference(rule.reference, undefined);
        return {
          id: name,
          state: null,
          type: '',
          installationPath: undefined,
          attributes: {
            fileSize: rule.reference.fileSize,
            author: util.getSafe(rule, ['extra', 'author'], undefined),
          },
          enabled: false,
          collectionRule: rule,
        };
      }
    }
  }

  private initModsEx(props: ICollectionPageProps): { [modId: string]: IModEx } {
    const { collection } = props;

    return (collection.rules || [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type))
      .reduce<{ [modId: string]: IModEx }> ((prev, rule) => {
        const id = this.ruleId(rule);
        prev[id] = this.modFromRule(props, rule);
        return prev;
      }, {});
  }
}

function mapStateToProps(state: types.IState): IConnectedProps {
  return {};
}

function mapDispatchToProps(dispatch: Redux.Dispatch): IActionProps {
  return {
    onSetModEnabled: (profileId: string, modId: string, enabled: boolean) =>
      dispatch(actions.setModEnabled(profileId, modId, enabled)),
    onRemoveRule: (gameId: string, modId: string, rule: types.IModRule) =>
      dispatch(actions.removeModRule(gameId, modId, rule)),
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(
  CollectionPage) as React.ComponentClass<ICollectionPageProps>;
