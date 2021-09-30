import { AUTHOR_UNKNOWN, AVATAR_FALLBACK, INSTALLING_NOTIFICATION_ID } from '../../constants';
import { testDownloadReference } from '../../util/findModByRef';
import InstallDriver from '../../util/InstallDriver';

import { IModEx } from '../../types/IModEx';
import { IRevisionEx } from '../../types/IRevisionEx';
import { IStateEx } from '../../types/IStateEx';

import CollectionItemStatus from './CollectionItemStatus';
import CollectionOverview from './CollectionOverview';
import CollectionProgress from './CollectionProgress';

import { ICollection, ICollectionRevisionMod, IModFile, IRevision } from '@nexusmods/nexus-api';
import * as Promise from 'bluebird';
import i18next from 'i18next';
import * as _ from 'lodash';
import * as React from 'react';
import { Image, Panel } from 'react-bootstrap';
import ReactDOM = require('react-dom');
import { connect } from 'react-redux';
import * as Redux from 'redux';
import * as semver from 'semver';
import { actions, ComponentEx, FlexLayout, ITableRowAction, OptionsFilter, Table,
         TableTextFilter, tooltip, types, util } from 'vortex-api';

export interface ICollectionPageProps {
  t: i18next.TFunction;
  className: string;
  profile: types.IProfile;
  collection: types.IMod;
  driver: InstallDriver;
  mods: { [modId: string]: types.IMod };
  downloads: { [dlId: string]: types.IDownload };
  notifications: types.INotification[];
  onView: (modId: string) => void;
  onPause: (collectionId: string) => void;
  onCancel: (collectionId: string) => void;
  onClone: (collectionId: string) => void;
  onResume: (collectionId: string) => void;
  onInstallManually: (collectionId: string, rules: types.IModRule[]) => void;
  onVoteSuccess: (collectionId: string, success: boolean) => void;
}

interface IConnectedProps {
  userInfo: any;
  votedSuccess: boolean;
  activity: { [id: string]: string };
  language: string;
  overlays: { [id: string]: types.IOverlay };
}

interface IActionProps {
  onSetModEnabled: (profileId: string, modId: string, enabled: boolean) => void;
  onRemoveRule: (gameId: string, modId: string, rule: types.IModRule) => void;
  onShowError: (message: string, details?: string | Error | any, allowReport?: boolean) => void;
}

interface IComponentState {
  modsEx: { [modId: string]: IModEx };
  revisionInfo: IRevision;
  modSelection: Array<{ local: IModEx, remote: ICollectionRevisionMod }>;
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

const STATUS_ORDER: string[] =
  ['Download Pending', 'Downloading', 'Install Pending', 'Installing', 'Disabled', 'Enabled'];

type IProps = ICollectionPageProps & IConnectedProps & IActionProps;

function arr(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input];
}

function matchRepo(mod: IModEx, ref: IModFile) {
  const modId = mod.attributes?.modId || mod.collectionRule?.reference?.repo?.modId;
  const fileId = mod.attributes?.fileId || mod.collectionRule?.reference?.repo?.fileId;

  if ((modId === undefined) || (fileId === undefined)
      || (ref.modId === undefined) || (ref.fileId === undefined)) {
    return false;
  }

  return modId.toString() === ref.modId.toString()
    && fileId.toString() === ref.fileId.toString();
}

class CollectionPage extends ComponentEx<IProps, IComponentState> {
  private mAttributes: Array<types.ITableAttribute<IModEx>>;
  private mUpdateDebouncer: util.Debouncer;
  private mModActions: ITableRowAction[];
  private mTableContainerRef: Element;
  private mLastModsFinal: { [ruleId: string]: IModEx };
  private mInstalling: boolean = false;

  constructor(props: IProps) {
    super(props);
    this.initState({
      modsEx: {},
      revisionInfo: undefined,
      modSelection: [],
    });

    this.mModActions = [
      {
        icon: 'install',
        title: 'Install',
        action: this.installManually,
        condition: instanceIds => {
          const instanceId: string = Array.isArray(instanceIds) ? instanceIds[0] : instanceIds;
          const mod = this.state.modsEx[instanceId];
          return [null, 'downloaded'].includes(mod.state);
        },
      },
      {
        icon: 'delete',
        title: 'Remove',
        action: this.removeSelected,
        condition: instanceId => (typeof(instanceId) === 'string')
            ? (['downloaded', 'installed'].includes(this.state.modsEx[instanceId].state))
            : true,
        hotKey: { code: 46 },
      },
      {
        icon: 'toggle-disabled',
        title: 'Ignore',
        action: this.ignoreSelected,
        condition: instanceIds => arr(instanceIds).find(id =>
          this.state.modsEx[id].collectionRule['ignored'] !== true) !== undefined,
      },
      {
        icon: 'toggle-enabled',
        title: 'Stop Ignoring',
        action: this.unignoreSelected,
        condition: instanceIds => arr(instanceIds).find(id =>
          this.state.modsEx[id].collectionRule['ignored'] === true) !== undefined,
      },
    ];

    this.mAttributes = [
      {
        id: 'collection_status',
        name: 'Status',
        description: 'Is mod enabled in current profile',
        icon: 'check-o',
        customRenderer: (mod: IModEx) => {
          const download = (mod.archiveId !== undefined)
            ? this.props.downloads[mod.archiveId]
            : undefined;

          return (
            <CollectionItemStatus
              t={this.props.t}
              mod={mod}
              download={download}
              notifications={this.props.notifications}
              container={this.mTableContainerRef}
              installing={this.mInstalling}
            />
          );
        },
        calc: (mod: IModEx) => {
          if (mod.collectionRule['ignored']) {
            return ['Ignored'];
          } else if (mod.state === 'installing') {
            return ['Installing', Math.floor(mod.progress * 100.0) / 100.0];
          } else if (mod.state === 'downloading') {
            return ['Downloading', Math.floor(mod.progress * 100.0) / 100.0];
          } else if (mod.state === null) {
            return ['Download Pending', 'Pending'];
          } else if (mod.state === 'downloaded') {
            return ['Install Pending', 'Pending'];
          }
          return [mod.enabled === true ? 'Enabled' : 'Disabled'];
        },
        placement: 'table',
        isToggleable: false,
        edit: {},
        isSortable: true,
        sortFunc: (lhs: string[], rhs: string[]): number => {
          return STATUS_ORDER.indexOf(lhs[0]) - STATUS_ORDER.indexOf(rhs[0]);
        },
        filter: new OptionsFilter([
          { value: 'Enabled', label: 'Enabled' },
          { value: 'Disabled', label: 'Disabled' },
          { value: 'Installing', label: 'Installing' },
          { value: 'Downloading', label: 'Downloading' },
          { value: 'Pending', label: 'Pending' },
        ], true, false),
      },
      {
        id: 'required',
        name: 'Required',
        description: 'Is the mod required for this collection',
        placement: 'table',
        calc: (mod: IModEx) => mod.collectionRule.type === 'requires',
        edit: {},
        filter: new OptionsFilter([
          { value: false, label: 'Recommended'},
          { value: true, label: 'Required'}],
          false, false),
      },
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
        calc: mod => {
          let verString = (mod.state !== null)
            ? mod.attributes.version ?? mod.collectionRule.reference.versionMatch ?? '0.0.0'
            : mod.collectionRule.reference.versionMatch;
          if (verString.endsWith('+prefer')) {
            const sv = semver.minVersion(verString);
            verString = sv.version;
          }
          return verString;
        },
        placement: 'table',
        edit: {},
      },
      {
        id: 'uploader',
        name: 'Uploader',
        customRenderer: (mod: IModEx) => {
          const { t } = this.props;

          let name: string;
          let avatar: string;
          if (this.state.revisionInfo !== undefined) {
            const revMods: ICollectionRevisionMod[] = this.state.revisionInfo?.modFiles || [];
            const revMod = revMods.find(iter => matchRepo(mod, iter.file));

            name = mod.attributes?.uploader || revMod?.file?.owner?.name;
            avatar = mod.attributes?.uploaderAvatar
                  || revMod?.file?.owner?.avatar;
          } else if (mod.attributes !== undefined) {
            name = mod.attributes?.uploader;
            avatar = mod.attributes?.uploaderAvatar;
          }

          return (
            <div>
              <Image circle src={avatar || AVATAR_FALLBACK} />
              {name || t(AUTHOR_UNKNOWN)}
            </div>
          );
        },
        calc: mod => mod?.attributes?.author || this.props.t(AUTHOR_UNKNOWN),
        placement: 'table',
        edit: {},
        isToggleable: false,
        isSortable: true,
      },
      {
        id: 'instructions',
        name: 'Instructions',
        customRenderer: (mod: IModEx) => {
          const instructions = this.getModInstructions(mod.id);
          if (instructions === undefined) {
            return null;
          }

          return (
            <tooltip.IconButton
              icon='details'
              tooltip={instructions}
              data-modid={mod.id}
              onClick={this.toggleInstructions}
            />
          );
        },
        calc: mod => {
          return this.getModInstructions(mod.id);
        },
        placement: 'table',
        edit: {},
      },
    ];
  }

  public async componentDidMount() {
    const { collection, userInfo } = this.props;

    if ((collection.attributes.revisionId !== undefined) && (userInfo !== undefined)) {
      this.nextState.revisionInfo = await
        this.props.driver.infoCache.getRevisionInfo(collection.attributes.revisionId);
    }

    const modsEx = this.initModsEx(this.props);
    this.nextState.modsEx = modsEx;
  }

  public async UNSAFE_componentWillReceiveProps(newProps: ICollectionPageProps) {
    if ((this.props.mods !== newProps.mods)
        || (this.props.profile !== newProps.profile)
        || (this.props.collection !== newProps.collection)
        || (this.props.downloads !== newProps.downloads)
        || this.installingNotificationsChanged(this.props, newProps)) {
      this.nextState.modsEx = this.updateModsEx(this.props, newProps);
      const { collection } = this.props;
      if (collection.attributes.revisionId !== undefined) {
        this.nextState.revisionInfo = await
          this.props.driver.infoCache.getRevisionInfo(collection.attributes.revisionId);
      }
    }
  }

  public shouldComponentUpdate(newProps: ICollectionPageProps & IConnectedProps,
                               newState: IComponentState) {
    if ((this.props.mods !== newProps.mods)
        || (this.props.profile !== newProps.profile)
        || (this.props.downloads !== newProps.downloads)
        || (this.props.collection !== newProps.collection)
        || this.installingNotificationsChanged(this.props, newProps)
        || (this.props.activity.mods !== newProps.activity.mods)
        || (this.state.revisionInfo !== newState.revisionInfo)
        || (this.state.modSelection !== newState.modSelection)
        || (this.state.modsEx !== newState.modsEx)) {
      return true;
    }
    return false;
  }

  public render(): JSX.Element {
    const { t, activity, className, collection, driver, downloads, language, notifications,
            onVoteSuccess, profile, userInfo, votedSuccess } = this.props;
    const { modSelection, modsEx, revisionInfo } = this.state;

    if (collection === undefined) {
      return null;
    }

    const incomplete = Object.values(modsEx)
      .find(mod => (mod.state !== 'installed')
                && !mod.collectionRule['ignored']
                && (mod.collectionRule.type === 'requires')) !== undefined;

    const totalSize = Object.values(modsEx).reduce((prev, mod) => {
      const size = util.getSafe(mod, ['attributes', 'fileSize'], 0);
      return prev + size;
    }, 0);

    if (collection !== undefined) {
      // during installation we display only the remote information in the header area,
      // that's why we require driver.collectionInfo to be set
      this.mInstalling = incomplete
              && !driver.installDone
              && (driver.collection?.id === collection?.id);
    } else {
      this.mInstalling = undefined;
    }

    return (
      <FlexLayout type='column' className={className}>
        <FlexLayout.Fixed className='collection-overview-panel'>
            <CollectionOverview
              t={t}
              language={language}
              gameId={profile.gameId}
              collection={collection}
              totalSize={totalSize}
              revision={revisionInfo}
              votedSuccess={votedSuccess}
              onClose={this.close}
              onClone={this.clone}
              onRemove={this.remove}
              onVoteSuccess={onVoteSuccess}
              onDeselectMods={this.unselectMods}
              incomplete={incomplete}
              modSelection={((this.mInstalling && (driver.collectionInfo !== undefined))
                ? revisionInfo?.modFiles?.map?.(file => ({ local: undefined, remote: file }))
                : modSelection) ?? []}
            />
        </FlexLayout.Fixed>
        <FlexLayout.Flex className='collection-mods-panel'>
          <Panel ref={this.setTableContainerRef}>
            <Panel.Body>
              <Table
                tableId='collection-mods'
                showDetails={false}
                data={modsEx}
                staticElements={this.mAttributes}
                actions={this.mModActions}
                onChangeSelection={this.changeModSelection}
              />
            </Panel.Body>
          </Panel>
        </FlexLayout.Flex>
        <FlexLayout.Fixed>
          <CollectionProgress
            t={t}
            isPremium={userInfo?.isPremium}
            mods={modsEx}
            profile={profile}
            downloads={downloads}
            totalSize={totalSize}
            activity={activity}
            onCancel={this.cancel}
            onPause={this.mInstalling ? this.pause : undefined}
            onResume={this.mInstalling
              ? undefined
              : (driver.collection !== undefined) && !driver.installDone
              ? null // installing something else
              : this.resume}
          />
        </FlexLayout.Fixed>
      </FlexLayout>
    );
  }

  private progress(props: ICollectionPageProps, mod: IModEx) {
    const { downloads, notifications } = props;

    if (mod.state === 'downloading') {
      const { received, size } = downloads[mod.archiveId];
      if (!!size) {
        return received / size;
      }
    } else if (mod.state === 'installing') {
      const notification = notifications.find(noti => noti.id === 'install_' + mod.id);
      if (notification !== undefined) {
        return (notification.progress ?? 100) / 100;
      } else {
        return 1;
      }
    }

    return 0;
  }

  private pause = () => {
    this.props.onPause(this.props.collection.id);
  }

  private cancel = () => {
    this.props.onCancel(this.props.collection.id);
  }

  private resume = () => {
    this.props.onResume(this.props.collection.id);
  }

  private close = () => {
    this.props.onView(undefined);
  }

  private unselectMods = () => {
    this.nextState.modSelection = [];
  }

  private clone = (collectionId: string) => {
    const { modsEx } = this.state;

    const incomplete = Object.values(modsEx)
      .filter(mod => (mod.state !== 'installed'));

    if (incomplete.length > 0) {
      return this.context.api.showDialog('info', 'Cloning incomplete', {
        text: 'The collection you\'re trying to clone is incomplete. Vortex can '
            + 'not include a mod in a collection that isn\'t installed so if you continue, '
            + 'the clone will not include these missing mods..',
        message: incomplete.map(mod => util.renderModName(mod)).join('\n'),
      }, [
        { label: 'Cancel' },
        { label: 'Clone anyway', action: () => { this.props.onClone(collectionId); } },
      ]);
    } else {
      this.props.onClone(collectionId);
    }
  }

  private remove = (collectionId: string) => {
    this.props.onCancel(collectionId);
  }

  private changeModSelection = (modIds: string[]) => {
    const { modsEx, revisionInfo } = this.state;

    this.nextState.modSelection = modIds.map(modId => {
      const mod = modsEx[modId];
      return {
        local: mod,
        remote: revisionInfo?.modFiles?.find?.(file => matchRepo(mod, file.file)),
      };
    });
  }

  private setModEnabled = (modId: string, enabled: boolean) => {
    const { profile } = this.props;
    this.props.onSetModEnabled(profile.id, modId, enabled);
  }

  private setTableContainerRef = (ref: any) => {
    this.mTableContainerRef = (ref !== null)
      ? ReactDOM.findDOMNode(ref) as Element
      : null;
  }

  private toggleInstructions = (evt: React.MouseEvent<any>) => {
    const modId = evt.currentTarget.getAttribute('data-modid');
    const { mods, onShowError, overlays } = this.props;
    const instructions = this.getModInstructions(modId);
    if (instructions === undefined) {
      // This shouldn't be possible
      const err = new util.ProcessCanceled('No instructions found', modId);
      err['attachLogOnReport'] = true;
      onShowError('Failed to display instructions', err, true);
      return;
    }

    const mod = mods[modId];
    const modName = util.renderModName(mod);
    if (overlays[modId]?.text !== undefined) {
      this.context.api.ext.dismissOverlay?.(modId);
    } else {
      this.context.api.ext.showOverlay?.(modId, modName, instructions,
        { x: evt.pageX, y: evt.pageY });
    }
  }

  private getModInstructions = (modId: string) => {
    const { collection, mods } = this.props;
    const mod = mods[modId];
    const modRule = collection.rules?.find(rule => util.testModReference(mod, rule.reference));
    return modRule?.['extra']?.['instructions'];
  }

  private installingNotificationsChanged(oldProps: ICollectionPageProps,
                                         newProps: ICollectionPageProps): boolean {
    if (oldProps.notifications !== newProps.notifications) {
      const oldInstalling = oldProps.notifications
        .filter(noti => noti.id.startsWith(INSTALLING_NOTIFICATION_ID));
      const newInstalling = newProps.notifications
        .filter(noti => noti.id.startsWith(INSTALLING_NOTIFICATION_ID));

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

  private enableSelected = (ruleIds: string[]) => {
    const { profile, onSetModEnabled } = this.props;
    const { modsEx } = this.state;

    const modIds = ruleIds.map(iter => modsEx[iter]?.id).filter(iter => iter !== undefined);

    modIds.forEach((modId: string) => {
      if (!util.getSafe(profile.modState, [modId, 'enabled'], false)) {
        onSetModEnabled(profile.id, modId, true);
      }
    });
    this.context.api.events.emit('mods-enabled', modIds, true, profile.gameId);
  }

  private disableSelected = (ruleIds: string[]) => {
    const { profile, onSetModEnabled } = this.props;
    const { modsEx } = this.state;

    const modIds = ruleIds.map(iter => modsEx[iter]?.id).filter(iter => iter !== undefined);

    modIds.forEach((modId: string) => {
      if (util.getSafe(profile.modState, [modId, 'enabled'], false)) {
        onSetModEnabled(profile.id, modId, false);
      }
    });
    this.context.api.events.emit('mods-enabled', modIds, false, profile.gameId);
  }

  private ignoreSelected = (modIds: string[]) => {
    const { collection, profile } = this.props;
    const { modsEx } = this.state;

    util.batchDispatch(
      this.context.api.store,
      modIds.reduce((prev: Redux.Action[], modId: string) => {
        prev.push(actions.addModRule(profile.gameId, collection.id, {
          ...modsEx[modId].collectionRule,
          ignored: true,
        } as any));
        return prev;
      }, []),
    );
  }

  private unignoreSelected = (modIds: string[]) => {
    const { collection, profile } = this.props;
    const { modsEx } = this.state;

    util.batchDispatch(
      this.context.api.store,
      modIds.reduce((prev: Redux.Action[], modId: string) => {
        prev.push(actions.addModRule(profile.gameId, collection.id, {
          ...modsEx[modId].collectionRule,
          ignored: false,
        } as any));
        return prev;
      }, []),
    );
  }

  private installManually = (modIds: string[]) => {
    const { collection } = this.props;
    const { modsEx } = this.state;
    const rules = modIds.map(modId => modsEx[modId].collectionRule);
    this.props.onInstallManually(collection.id, rules);
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
    ];

    if (collection.attributes?.editable === true) {
      checkboxes.push({ id: 'collection', text: t('Remove from Collection'), value: false });
    }

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
            ? util.removeMods(this.context.api, profile.gameId, wereInstalled)
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

    const modifiedState: { [modId: string]: { enabled: boolean } }
      = util.objDiff(oldProps.profile.modState, newProps.profile.modState);

    const genRuleMap = (rules: types.IModRule[]) => {
      return (rules || []).reduce((prev, rule) => {
        prev[this.ruleId(rule)] = rule;
        return prev;
      }, {});
    };

    const modifiedRules: { [ruleId: string]: types.IModRule }
      = util.objDiff(genRuleMap(oldProps.collection.rules), genRuleMap(newProps.collection.rules));

    // remove any cache entry where the download or the mod has been
    // removed or changed
    Object.keys(modifiedDownloads)
      .filter(dlId => dlId.startsWith('-'))
      .forEach(dlId => {
        const refId = Object.keys(result).find(iter => result[iter].archiveId === dlId.slice(1));
        delete result[refId];
      });

    const invalidateMod = modId => {
      const realId = modId.slice(1);
      const refId = Object.keys(result).find(iter => result[iter].id === realId);
      delete result[refId];
    };

    Object.keys(modifiedMods)
      .filter(modId => modId.startsWith('-'))
      .forEach(invalidateMod);

    Object.keys(modifiedState)
      .filter(modId => modId.startsWith('-')
                    || modifiedState[modId]?.['-enabled'] !== undefined)
      .forEach(invalidateMod);

    // refresh for any rule that doesn't currently have an entry or that was modified
    const { collection } = newProps;

    (collection.rules || [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type))
      .forEach(rule => {
        const id = this.ruleId(rule);
        if ((result[id] === undefined) || (modifiedRules[id] !== undefined)) {
          result[id] = this.modFromRule(newProps, rule);
        }
      });

    // also remove and add entries if a rule was added/removed
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
        const download = newProps.downloads[dlId.slice(1)];
        const match = pendingDL.find(modId =>
          testDownloadReference(download, modsEx[modId].collectionRule.reference));
        if (match !== undefined) {
          result[match] = this.modFromDownload(dlId.slice(1),
                                               download,
                                               modsEx[match].collectionRule);
        }
      });

    // this will get called for each mod that has been enabled, its state changed
    // or an attribute changed (since attribute changes might affect how rules get resolved to
    // actual mods)
    const updateMod = modId => {
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
            ...(profile.modState || {})[mod.id],
            collectionRule: modsEx[match].collectionRule,
          };
        }
      }
    };

    Object.keys(modifiedMods)
      .filter(modId => !modId.startsWith('-')
                    && (modId.startsWith('+')
                        || (modifiedMods[modId]['+state'] !== undefined)
                        || (modifiedMods[modId]['attributes'] !== undefined)
                        ))
      .forEach(updateMod);

    Object.keys(modifiedState)
      .filter(modId => modifiedState[modId]?.['+enabled'] !== undefined)
      .forEach(updateMod);

    // finally, update any rule that had progress
    Object.keys(modifiedDownloads)
      .filter(dlId => !dlId.startsWith('-') && !dlId.startsWith('+'))
      .forEach(dlId => {
        let ruleId = Object.keys(result).find(modId => result[modId].archiveId === dlId);
        if ((ruleId === undefined)
            && (newProps.downloads[dlId].modInfo?.referenceTag !== undefined)) {
          ruleId = Object.keys(result).find(id =>
            (result[id].archiveId === undefined)
            && testDownloadReference(newProps.downloads[dlId],
                                     result[id].collectionRule.reference));
          if (ruleId !== undefined) {
            result[ruleId] = {
              ...result[ruleId],
              archiveId: dlId,
              state: 'downloading',
            };
          }
        }

        if (ruleId !== undefined) {
          result[ruleId] = {
            ...result[ruleId],
            progress: this.progress(newProps, result[ruleId]),
          };

          const dl = newProps.downloads[result[ruleId].archiveId];
          if (['finished', 'failed'].includes(dl.state) && !pendingFinish.includes(ruleId)) {
            result[ruleId].state = 'downloaded';
          }
        }
      });

    newProps.notifications.forEach(noti => {
      if ((noti.id !== undefined) && (noti.id.startsWith('install_'))) {
        const modId = noti.id.slice(8);
        const ruleId = Object.keys(result).find(iter => result[iter].id === modId);
        if (ruleId !== undefined) {
          result[ruleId] = {
            ...result[ruleId],
            progress: this.progress(newProps, result[ruleId]),
          };
        }
      }
    });

    return result;
  }

  private modFromDownload(dlId: string, download: types.IDownload, rule: types.IModRule): IModEx {
    const modId = download.modInfo?.meta?.details?.modId
                ?? download.modInfo?.nexus?.ids?.modId;

    return {
      id: dlId,
      type: '',
      installationPath: undefined,
      archiveId: dlId,
      enabledTime: 0,
      state: download.state === 'finished' ? 'downloaded' : 'downloading',
      enabled: false,
      collectionRule: rule,
      attributes: {
        customFileName: download?.modInfo?.name,
        fileName: download.modInfo?.nexus?.fileInfo?.name
              ?? util.renderModReference(rule.reference),
        fileSize: download.size ?? rule.reference.fileSize,
        name: dlId,
        version: download.modInfo?.nexus?.fileInfo?.mod_version,
        author: download.modInfo?.nexus?.modInfo?.user?.name,
        category: download.modInfo?.nexus?.modInfo?.category_id,
        source: download.modInfo?.nexus !== undefined ? 'nexus' : undefined,
        modId,
        downloadGame: download.game,
      },
    };
  }

  private modFromRule(props: ICollectionPageProps, rule: types.IModRule): IModEx {
    const { downloads, mods, profile } = props;

    const mod: types.IMod = util.findModByRef(rule.reference, mods);

    if (mod !== undefined) {
      return {
        ...mods[mod.id],
        ...profile.modState[mod.id],
        collectionRule: rule,
      };
    } else {
      const dlId: string = util.findDownloadByRef(rule.reference, downloads);

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
          enabledTime: 0,
          attributes: {
            fileSize: rule.reference.fileSize,
            ...(rule.extra || {}),
            // rule.extra.fileName is an actual file name, in the mod attributes we expect
            // it to be the name specified by the author
            fileName: rule.extra?.name,
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

function mapStateToProps(state: IStateEx, ownProps: ICollectionPageProps): IConnectedProps {
  const { nexus } = state.persistent as any;
  const { collection } = ownProps;

  let votedSuccess;

  if (collection?.attributes?.revisionNumber !== undefined) {
    const { collectionId, revisionNumber } = collection.attributes;
    const collectionInfo: ICollection = state.persistent.collections[collectionId]?.info;
    const revisionInfo: IRevisionEx =
      collectionInfo?.revisions?.find(rev => rev.revision === revisionNumber);
    votedSuccess = revisionInfo !== undefined
       ? revisionInfo.success
       : false;
  }

  return {
    userInfo: nexus.userInfo,
    votedSuccess,
    activity: state.session.base.activity,
    language: state.settings.interface.language,
    overlays: state.session.overlays.overlays,
  };
}

function mapDispatchToProps(dispatch: Redux.Dispatch): IActionProps {
  return {
    onSetModEnabled: (profileId: string, modId: string, enabled: boolean) =>
      dispatch(actions.setModEnabled(profileId, modId, enabled)),
    onRemoveRule: (gameId: string, modId: string, rule: types.IModRule) =>
      dispatch(actions.removeModRule(gameId, modId, rule)),
    onShowError: (message: string, details?: string | Error | any, allowReport?: boolean) =>
      util.showError(dispatch, message, details, { allowReport }),
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(
  CollectionPage) as any as React.ComponentType<ICollectionPageProps>;
