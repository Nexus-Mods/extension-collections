import { AUTHOR_UNKNOWN } from '../../constants';
import { findDownloadIdByRef, findModByRef, testDownloadReference } from '../../util/findModByRef';

import { IModEx } from '../../types/IModEx';

import CollectionItemStatus from './CollectionItemStatus';
import CollectionOverview from './CollectionOverview';

import * as Promise from 'bluebird';
import i18next from 'i18next';
import * as _ from 'lodash';
import * as React from 'react';
import { Image, Nav, NavItem, Panel } from 'react-bootstrap';
import { ComponentEx, FlexLayout, OptionsFilter, Table,
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

class CollectionPage extends ComponentEx<ICollectionPageProps, IComponentState> {
  private mAttributes: Array<types.ITableAttribute<IModEx>>;
  private mUpdateDebouncer: util.Debouncer;

  constructor(props: ICollectionPageProps) {
    super(props);
    this.initState({
      modsEx: {},
    });

    this.mAttributes = [
      {
        id: 'enabled',
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
          if (mod.state === 'downloaded') {
            return (util.getSafe(mod.attributes, ['wasInstalled'], false))
              ? 'Uninstalled'
              : 'Never Installed';
          } else if (mod.state === 'installing') {
            return 'Installing';
          }
          return mod.enabled === true ? 'Enabled' : 'Disabled';
        },
        placement: 'table',
        isToggleable: false,
        edit: {},
        noShrink: true,
        isSortable: false,
        filter: new OptionsFilter([
          { value: true, label: 'Enabled' },
          { value: false, label: 'Disabled' },
          { value: undefined, label: 'Uninstalled' },
        ], true),
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
        isToggleable: false,
      },
      {
        id: 'size',
        name: 'Size',
        calc: mod => util.bytesToString(util.getSafe(mod, ['attributes', 'fileSize'], 0)),
        placement: 'table',
        edit: {},
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
    const { t, className, collection, mods, onView, profile } = this.props;
    const { modsEx } = this.state;

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
            onClose={this.close}
          />
        </FlexLayout.Fixed>
        <FlexLayout.Flex fill={true} className='collection-mods-panel'>
          <Panel>
            <Table
              tableId='mods'
              showDetails={false}
              data={modsFinal}
              staticElements={this.mAttributes}
              actions={[]}
            />
          </Panel>
        </FlexLayout.Flex>
        <FlexLayout.Fixed>
          <Panel>
            Foobar
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

  private updateModsEx(oldProps: ICollectionPageProps,
                       newProps: ICollectionPageProps)
                       : { [modId: string]: IModEx } {
    // keep our cache updated
    const result = { ...this.state.modsEx };

    const modifiedDownloads: { [dlId: string]: types.IDownload }
      = util.objDiff(oldProps.downloads, newProps.downloads);

    const modifiedMods: { [modId: string]: types.IMod }
      = util.objDiff(oldProps.mods, newProps.mods);

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
          },
          enabled: false,
          collectionRule: rule,
        };
      }
    }
  }

  private initModsEx(props: ICollectionPageProps): { [modId: string]: IModEx } {
    const { collection, downloads, mods, profile } = props;

    return collection.rules
      .filter(rule => ['requires', 'recommends'].includes(rule.type))
      .reduce<{ [modId: string]: IModEx }> ((prev, rule) => {
        const id = this.ruleId(rule);
        prev[id] = this.modFromRule(props, rule);
        return prev;
      }, {});
  }
}

export default CollectionPage as React.ComponentClass<ICollectionPageProps>;
