import { updateSuccessRate } from '../../actions/persistent';
import { doExportToAPI } from '../../collectionExport';
import { INSTALLING_NOTIFICATION_ID, MOD_TYPE, NAMESPACE, NEXUS_NEXT_URL, TOS_URL} from '../../constants';
import { findExtensions, IExtensionFeature } from '../../util/extension';
import InstallDriver from '../../util/InstallDriver';

import CollectionEdit from './CollectionEdit';
import CollectionPage from './CollectionPage';
import StartPage from './StartPage';

import I18next from 'i18next';
import * as React from 'react';
import { WithTranslation, withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { ThunkDispatch } from 'redux-thunk';
import { generate as shortid } from 'shortid';
import { actions, ComponentEx, FlexLayout, log, MainPage, selectors, tooltip,
          types, util } from 'vortex-api';

export interface ICollectionsMainPageBaseProps extends WithTranslation {
  active: boolean;
  secondary: boolean;

  driver: InstallDriver;
  onSetupCallbacks?: (callbacks: { [cbName: string]: (...args: any[]) => void }) => void;
  onCloneCollection: (collectionId: string) => Promise<string>;
  onCreateCollection: (profile: types.IProfile, name: string) => void;

  resetCB: (cb: () => void) => void;
}

interface IConnectedProps {
  profile: types.IProfile;
  game: types.IGameStored;
  mods: { [modId: string]: types.IMod };
  downloads: { [dlId: string]: types.IDownload };
  notifications: types.INotification[];
  exts: IExtensionFeature[];
  userInfo: { name: string, user_id: number };
}

interface IActionProps {
  removeMod: (gameId: string, modId: string) => void;
}

export type ICollectionsMainPageProps =
  ICollectionsMainPageBaseProps & IConnectedProps & IActionProps & { t: I18next.TFunction };

interface IComponentState {
  selectedCollection: string;
  matchedReferences: { [collectionId: string]: types.IMod[] };
  viewMode: 'view' | 'edit';
  activeTab: string;
}

const emptyObj = {};

class CollectionsMainPage extends ComponentEx<ICollectionsMainPageProps, IComponentState> {
  private mMatchRefDebouncer: util.Debouncer;
  constructor(props: ICollectionsMainPageProps) {
    super(props);
    this.initState({
      selectedCollection: undefined,
      matchedReferences: this.updateMatchedReferences(this.props),
      viewMode: 'view',
      activeTab: 'active-collections',
    });

    if (props.onSetupCallbacks !== undefined) {
      props.onSetupCallbacks({
        viewCollection: (collectionId: string) => {
          this.nextState.selectedCollection = collectionId;
          this.nextState.viewMode = 'view';
        },
        editCollection: (collectionId: string) => {
          this.nextState.selectedCollection = collectionId;
          this.nextState.viewMode = 'edit';
        },
      });
    }

    props.resetCB?.(this.resetMainPage);

    this.mMatchRefDebouncer = new util.Debouncer(() => {
      this.nextState.matchedReferences = this.updateMatchedReferences(this.props);
      return Promise.resolve();
    }, 2000);
  }

  public UNSAFE_componentWillReceiveProps(newProps: ICollectionsMainPageProps) {
    if (this.props.mods !== newProps.mods) {
      this.mMatchRefDebouncer.schedule();
    }
  }

  public componentWillUnmount() {
    this.mMatchRefDebouncer.clear();
  }

  public render(): JSX.Element {
    const { t, downloads, driver, game, mods, notifications, profile } = this.props;
    const { activeTab, matchedReferences, selectedCollection, viewMode } = this.state;

    const collection = (selectedCollection !== undefined)
      ? mods[selectedCollection]
      : undefined;

    let content = null;

    if (collection === undefined) {
      content = (
        <StartPage
          t={t}
          game={game}
          installing={driver.installDone ? undefined : driver.collection}
          profile={profile}
          mods={mods}
          matchedReferences={matchedReferences ?? emptyObj}
          activeTab={activeTab}
          onView={this.view}
          onEdit={this.edit}
          onRemove={this.remove}
          onUpload={this.upload}
          onCreateCollection={this.createCollection}
          onResume={this.resume}
          onPause={this.pause}
          onSetActiveTab={this.setActiveTab}
        />
      );
    } else {
      content = (
        <FlexLayout type='column'>
          <FlexLayout.Fixed>
            <tooltip.IconButton
              className='collection-back-btn'
              tooltip='Return to overview'
              icon='nav-back'
              onClick={this.deselectCollection}
            >
              {t('View All Collections')}
            </tooltip.IconButton>
          </FlexLayout.Fixed>
          <FlexLayout.Flex>
            {(viewMode === 'view') ? (
              <CollectionPage
                t={t}
                className='collection-details'
                driver={this.props.driver}
                profile={profile}
                collection={collection}
                mods={mods}
                downloads={downloads}
                notifications={notifications}
                onView={this.view}
                onPause={this.pause}
                onCancel={this.cancel}
                onClone={this.clone}
                onResume={this.resume}
                onInstallOptionals={this.installOptional}
                onVoteSuccess={this.voteSuccess}
              />
            )
              : (
                <CollectionEdit
                  profile={profile}
                  collection={collection}
                  mods={mods}
                  driver={this.props.driver}
                  onRemove={this.remove}
                  onUpload={this.upload}
                  exts={this.props.exts}
                />
              )}
          </FlexLayout.Flex>
        </FlexLayout>
      );
    }

    return (
      <MainPage id='collection-page'>
        <MainPage.Body>
          {content}
        </MainPage.Body>
      </MainPage>
    );
  }

  private setActiveTab = (tabId: string) => {
    this.nextState.activeTab = tabId;
  }

  private createCollection = (name: string) => {
    const { profile, onCreateCollection } = this.props;
    onCreateCollection(profile, name);
  }

  private deselectCollection = () => {
    this.nextState.selectedCollection = undefined;
  }

  private resetMainPage = () => {
    this.deselectCollection();
  }

  private view = (modId: string) => {
    this.nextState.selectedCollection = modId;
    this.nextState.viewMode = 'view';
  }

  private edit = async (modId: string) => {
    const { mods, userInfo } = this.props;
    const { api } = this.context;

    const author = mods[modId].attributes['author'];

    if ((author !== undefined) && (author !== userInfo?.name)) {
      const result = await api.showDialog('question',
        'Edit Collection', {
          text: 'This collection has been uploaded with a different account ({{uploadAuthor}}) '
              + 'than you\'re using now ({{currentUser}}). '
              + 'If you edit and upload this collection now it will be uploaded as a new '
              + 'collection by your current user.',
          parameters: {
            uploadAuthor: author,
            currentUser: userInfo?.name ?? '<Logged out>',
          },
        }, [
          { label: 'Cancel' },
          { label: 'Continue' },
        ]);
      if (result.action === 'Cancel') {
        return;
      }
    }
    this.nextState.selectedCollection = modId;
    this.nextState.viewMode = 'edit';
  }

  private pause = (modId: string) => {
    const { downloads, mods } = this.props;

    const collection = mods[modId];
    collection.rules.forEach(rule => {
      const dlId = util.findDownloadByRef(rule.reference, downloads);
      if (dlId !== undefined) {
        this.context.api.events.emit('pause-download', dlId);
      }
    });
    const { api } = this.context;
    api.emitAndAwait('cancel-dependency-install', modId);

    this.props.driver.cancel();

    api.dismissNotification(INSTALLING_NOTIFICATION_ID + modId);
    api.sendNotification({
      id: 'collection-pausing',
      type: 'success',
      title: 'Collection pausing',
      message: 'Already queued mod installations will still finish',
    });
  }

  private async removeWorkshop(modId: string) {
    const { mods, profile } = this.props;
    const { api } = this.context;

    const result = await api.showDialog('question',
      'Remove Collection (Workshop)', {
        text: 'Deleting a collection will not remove the mods that have been added to it.\n\n'
            + 'Any changes made to this collection since the last upload to Nexus Mods will '
            + 'be lost.\n\n'
            + 'Are you sure you want to remove "{{collectionName}}" from your Workshop?',
        parameters: {
          collectionName: util.renderModName(mods[modId]),
        },
      }, [
        { label: 'Cancel' },
        { label: 'Remove' },
      ],
    );

    if (result.action === 'Remove') {
      await util.toPromise(cb => api.events.emit('remove-mod', profile.gameId, modId, cb));
    }
  }

  private clone = async (collectionId: string) => {
    const id: string = await this.props.onCloneCollection(collectionId);
    if (id !== undefined) {
      this.nextState.selectedCollection = id;
      this.nextState.viewMode = 'edit';
    }
  }

  private cancel = async (modId: string, message?: string) => {
    const { t, downloads, mods, profile } = this.props;
    const { api } = this.context;

    if (message === undefined) {
      message = 'Are you sure you want to cancel the installation?';
    }

    const result = await api.showDialog(
      'question',
      message, {
      text: 'This collection will be removed from Vortex and unlinked from any associated mods. '
          + 'You can also choose to uninstall mods related to this collection and delete the '
          + 'downloaded archives.\n'
          + '\nPlease note, some mods may be required by multiple collections.\n'
          + '\nAre you sure you want to remove "{{collectionName}}" from your collections?',
      parameters: {
        collectionName: util.renderModName(mods[modId]),
      },
      checkboxes: [
        { id: 'delete_mods', text: t('Remove mods'), value: false },
        { id: 'delete_archives', text: t('Delete mod archives'), value: false },
      ],
    }, [
      { label: 'Cancel' },
      { label: 'Remove Collection' },
    ]);

    // apparently one can't cancel out of the cancellation...
    if (result.action === 'Cancel') {
      return;
    }

    const state: types.IState = api.store.getState();

    let progress = 0;
    const notiId = shortid();
    const modName = util.renderModName(mods[modId]);
    const doProgress = (step: string, value: number) => {
      if (value <= progress) {
        return;
      }
      progress = value;
      api.sendNotification({
        id: notiId,
        type: 'activity',
        title: 'Removing {{name}}',
        message: step,
        progress,
        replace: {
          name: modName,
        },
      });
    };

    try {
      doProgress('Removing dowloads', 0);

      // either way, all running downloads are canceled. If selected, so are finished downloads
      const collection = mods[modId];
      let completed = 0;
      await Promise.all(collection.rules.map(async rule => {
        const dlId = util.findDownloadByRef(rule.reference, downloads);

        if (dlId !== undefined) {
          const download = state.persistent.downloads.files[dlId];
          if ((download !== undefined)
              && result.input.delete_archives || (download.state !== 'finished')) {
            await util.toPromise(cb => api.events.emit('remove-download', dlId, cb));
          }
        }
        doProgress('Removing dowloads', 50 * ((completed++) / collection.rules.length));
      }));

      doProgress('Removing mods', 50);
      completed = 0;
      // if selected, remove mods
      if (result.input.delete_mods) {
        const removeMods: string[] = collection.rules
          .map(rule => util.findModByRef(rule.reference, mods))
          .filter(mod => mod !== undefined)
          .map(mod => mod.id);

        await util.toPromise(cb =>
          api.events.emit('remove-mods', profile.gameId, removeMods, cb, {
            progressCB: (idx: number, length: number, name: string) => {
              doProgress(name, 50 + (50 * idx) / length);
            },
          }));
      }

      { // finally remove the collection itself
        doProgress('Removing collection', 0.99);
        const download = state.persistent.downloads.files[collection.archiveId];
        if (download !== undefined) {
          await util.toPromise(cb => api.events.emit('remove-download', collection.archiveId, cb));
        }
        await util.toPromise(cb => api.events.emit('remove-mod', profile.gameId, modId, cb));
      }
    } finally {
      api.dismissNotification(notiId);
    }
  }

  private voteSuccess = async (modId: string, success: boolean) => {
    const { mods } = this.props;
    const { api } = this.context;

    const collection = mods[modId];

    const { revisionId } = collection.attributes;

    if (revisionId === undefined) {
      return;
    }

    const voted = (api.emitAndAwait('rate-nexus-collection-revision',
                                    parseInt(revisionId, 10), success ? 10 : -10))[0];
    if (voted) {
      api.store.dispatch(updateSuccessRate(revisionId, success));
    }
  }

  private updateMatchedReferences(props: ICollectionsMainPageProps) {
    const { mods, profile } = props;
    const collections = Object.values(mods).filter(mod => mod.type === MOD_TYPE);
    return collections.reduce((prev, collection) => {
      prev[collection.id] =
        (collection.rules || [])
          .filter(rule => (rule.type === 'requires') && !rule['ignored'])
          .map(rule => {
            const mod = util.findModByRef(rule.reference, mods);
            if ((mod !== undefined) && !profile.modState[mod.id]?.enabled) {
              return null;
            }
            return mod ?? null;
          });
      return prev;
    }, {});
  }

  private remove = (modId: string) => {
    const { mods } = this.props;

    if (mods[modId].attributes?.editable) {
      return this.removeWorkshop(modId);
    } else {
      return this.cancel(modId, 'Remove collection');
    }
  }

  private upload = async (collectionId: string) => {
    const { mods, profile, userInfo } = this.props;

    const { api } = this.context;

    const missing = mods[collectionId].rules.filter(rule =>
      ['requires', 'recommends'].includes(rule.type)
      && (util.findModByRef(rule.reference, mods) === undefined));
    if (missing.length > 0) {
      await api.showDialog('error', 'Collection isn\'t fully installed', {
        text: 'You can only upload collections that are fully installed on this system.\n'
            + 'If you have removed mods that were part of this collection you may want to remove '
            + 'them from the collection as well. If this collection is connected to a '
            + 'profile you can simply update from that.',
        message:
          missing.map(rule => util.renderModReference(rule.reference)).join('\n'),
      }, [
        { label: 'Close' },
      ]);
      return;
    }

    const choice = await api.showDialog('question', 'Share on Nexus Mods', {
      bbcode: 'You are about to upload "{{collectionName}}" to Nexus Mods in a draft state. '
          + 'You will be able to add additional metadata and media before sharing it with '
          + 'the community.'
          + '\n\n'
          + 'Please ensure that your collection complies with our '
          + `[url=${TOS_URL}]Terms of Service[/url] before publishing.`,
      parameters: {
        collectionName: util.renderModName(mods[collectionId]),
      },
    }, [
      { label: 'Cancel' },
      { label: 'Upload' },
    ]);

    if (choice.action === 'Upload') {
      try {
        const nexusCollId = await doExportToAPI(api, profile.gameId, collectionId, userInfo.name);
        if (nexusCollId !== undefined) {
          api.sendNotification({
            type: 'success',
            message: 'Collection submitted',
            actions: [
              {
                title: 'Open in Browser', action: () => {
                  const game = selectors.gameById(api.getState(), profile.gameId);
                  // tslint:disable-next-line: max-line-length
                  const domainName = (util as any).nexusGameId(game);
                  const url = util.nexusModsURL([domainName, 'collections', nexusCollId], {
                    campaign: util.Campaign.ViewCollection,
                    section: util.Section.Collections,
                  });
                  util.opn(url).catch(() => null);
                },
              },
            ],
          });
        }
      } catch (err) {
        if (!(err instanceof util.UserCanceled)
            && !(err instanceof util.ProcessCanceled)) {
          api.showErrorNotification('Failed to publish to API', err, {
            allowReport: false,
          });
        }
      }
    }
  }

  private installOptional = (collectionId: string, rules: types.IModRule[]) => {
    const { api } = this.context;

    api.emitAndAwait('install-from-dependencies', collectionId, rules, true)
      .catch(err => {
        if (err instanceof util.UserCanceled) {
          return;
        }
        api.showErrorNotification('Failed to install dependencies', err, {
          allowReport: !(err instanceof util.ProcessCanceled),
        });
      });
  }

  private resume = async (modId: string) => {
    const { driver, mods, profile } = this.props;

    driver.start(profile, mods[modId]);
  }
}

function mapStateToProps(state: types.IState): IConnectedProps {
  const profile = selectors.activeProfile(state);
  const game = selectors.gameById(state, profile.gameId);
  return {
    game,
    profile,
    mods: state.persistent.mods[profile.gameId] || emptyObj,
    notifications: state.session.notifications.notifications,
    downloads: state.persistent.downloads.files,
    userInfo: state.persistent['nexus']?.userInfo,
    exts: findExtensions(state, profile.gameId),
  };
}

function mapDispatchToProps(dispatch: ThunkDispatch<any, null, Redux.Action>): IActionProps {
  return {
    removeMod: (gameId: string, modId: string) => dispatch(actions.removeMod(gameId, modId)),
  };
}

export default
  connect(mapStateToProps, mapDispatchToProps)(
    withTranslation([NAMESPACE, 'common'])(CollectionsMainPage));
