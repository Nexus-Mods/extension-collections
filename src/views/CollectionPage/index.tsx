import { updateSuccessRate } from '../../actions/persistent';
import { doExportToAPI } from '../../collectionExport';
import { MOD_TYPE, NAMESPACE, NEXUS_BASE_URL, NEXUS_DOMAIN} from '../../constants';
import { findExtensions, IExtensionFeature } from '../../util/extension';
import { findDownloadIdByRef, findModByRef } from '../../util/findModByRef';
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
    const { t, downloads, game, mods, notifications, profile } = this.props;
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

  private edit = (modId: string) => {
    this.nextState.selectedCollection = modId;
    this.nextState.viewMode = 'edit';
  }

  private pause = (modId: string) => {
    const { downloads, mods } = this.props;

    const collection = mods[modId];
    collection.rules.forEach(rule => {
      const dlId = findDownloadIdByRef(rule.reference, downloads);
      if (dlId !== undefined) {
        this.context.api.events.emit('pause-download', dlId);
      }
    });
  }

  private async removeWorkshop(modId: string) {
    const { mods, profile } = this.props;
    const { api } = this.context;

    const result = await api.showDialog('question',
      'Are you sure you want to remove the collection "{{collectionName}}"?', {
        text: 'You are removing this collection from your machine '
            + 'but not from the NexusMods website.\n'
            + 'You will lose any changes you made to this collection since the last upload. '
            + 'This operation can not be undone.\n'
            + 'The mods themselves will not be removed.',
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
      text: 'You can delete the collection including all the mods it contains or just the '
          + 'the collection, leaving already installed mods alone.',
      parameters: {
        collectionName: util.renderModName(mods[modId]),
      },
      checkboxes: [
        { id: 'delete', text: t('Remove installed mods'), value: false },
      ],
    }, [
      { label: 'Cancel' },
      { label: 'Remove' },
    ]);

    // apparently one can't cancel out of the cancellation...
    if (result.action === 'Cancel') {
      return;
    }

    const state: types.IState = api.store.getState();

    // either way, all running downloads are canceled
    const collection = mods[modId];
    await Promise.all(collection.rules.map(async rule => {
      const dlId = findDownloadIdByRef(rule.reference, downloads);

      if (dlId !== undefined) {
        const download = state.persistent.downloads.files[dlId];
        if ((download !== undefined)
            && result.input.delete || (download.state !== 'finished')) {
          await util.toPromise(cb => api.events.emit('remove-download', dlId, cb));
        }
      }
    }));

    if (result.input.delete) {
      await Promise.all(collection.rules.map(async rule => {
        const mod = findModByRef(rule.reference, mods);
        if (mod !== undefined) {
          await util.toPromise(cb => api.events.emit('remove-mod', profile.gameId, mod.id, cb));
        }
      }));
    }

    { // finally remove the collection itself
      const download = state.persistent.downloads.files[collection.archiveId];
      if (download !== undefined) {
        await util.toPromise(cb => api.events.emit('remove-download', collection.archiveId, cb));
      }
      await util.toPromise(cb => api.events.emit('remove-mod', profile.gameId, modId, cb));
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
    const { mods } = props;
    const collections = Object.values(mods).filter(mod => mod.type === MOD_TYPE);
    return collections.reduce((prev, collection) => {
      prev[collection.id] =
        (collection.rules || [])
          .filter(rule => rule.type === 'requires')
          .map(rule => {
            const mod = findModByRef(rule.reference, mods);
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
      return this.cancel(modId,
        'Are you sure you want to remove the collection "{{collectionName}}"?');
    }
  }

  private upload = async (collectionId: string) => {
    const { mods, profile } = this.props;

    const { api } = this.context;

    const missing = mods[collectionId].rules.filter(rule =>
      ['requires', 'recommends'].includes(rule.type)
      && (findModByRef(rule.reference, mods) === undefined));
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

    const choice = await api.showDialog('question', 'Confirm publishing', {
      text: 'Are you sure you want to upload the collection "{{collectionName}}"? '
          + 'Once uploaded you can hide or update a collection but it can\'t be removed. '
          + 'Please note: By uploading you agree that you adhere to the user agreement. '
          + 'In particular you agree that you aren\'t violating anyone\'s copyright and you '
          + 'agree to release your Collection (the list itself, instructions, ....) to '
          + 'the public domain.',
      parameters: {
        collectionName: util.renderModName(mods[collectionId]),
      },
    }, [
      { label: 'Cancel' },
      { label: 'Upload' },
    ]);

    if (choice.action === 'Upload') {
      try {
        const nexusCollId = await doExportToAPI(api, profile.gameId, collectionId);
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
                  const url = `${NEXUS_BASE_URL}/${domainName}/collections/${nexusCollId}`;
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
