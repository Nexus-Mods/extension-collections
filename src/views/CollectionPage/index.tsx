import { updateSuccessRate } from '../../actions/persistent';
import { MOD_TYPE, NAMESPACE, NEXUS_BASE_URL, NEXUS_DOMAIN} from '../../constants';
import { doExportToAPI } from '../../collectionExport';
import { findDownloadIdByRef, findModByRef } from '../../util/findModByRef';
import InfoCache from '../../util/InfoCache';
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
  onCreateCollection: (profile: types.IProfile, name: string) => void;
}

interface IConnectedProps {
  profile: types.IProfile;
  game: types.IGameStored;
  mods: { [modId: string]: types.IMod };
  downloads: { [dlId: string]: types.IDownload };
  notifications: types.INotification[];
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
}

class CollectionsMainPage extends ComponentEx<ICollectionsMainPageProps, IComponentState> {
  constructor(props: ICollectionsMainPageProps) {
    super(props);
    this.initState({
      selectedCollection: undefined,
      matchedReferences: this.updateMatchedReferences(this.props),
      viewMode: 'view',
    });

    console.log('construct collections main page', props);
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
  }

  public componentWillReceiveProps(newProps: ICollectionsMainPageProps) {
    if (this.props.mods !== newProps.mods) {
      this.nextState.matchedReferences = this.updateMatchedReferences(newProps);
    }
  }

  public render(): JSX.Element {
    const { t, downloads, game, mods, notifications, profile } = this.props;
    const { matchedReferences, selectedCollection, viewMode } = this.state;

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
          matchedReferences={matchedReferences}
          onView={this.view}
          onEdit={this.edit}
          onRemove={this.remove}
          onPublish={this.publish}
          onCreateCollection={this.createCollection}
          onResume={this.resume}
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

  private createCollection = (name: string) => {
    const { profile, onCreateCollection } = this.props;
    onCreateCollection(profile, name);
  }

  private deselectCollection = () => {
    this.nextState.selectedCollection = undefined;
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
        { id: 'delete', text: t('Delete installed mods'), value: false },
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
            if (mod === undefined) {
              log('debug', 'mod not found', JSON.stringify(rule.reference));
            }
            return mod ?? null;
          });
      return prev;
    }, {});
  }

  private remove = (modId: string) => {
    return this.cancel(modId,
      'Are you sure you want to remove the collection "{{collectionName}}"?');
  }

  private publish = async (modId: string) => {
    const { mods, profile } = this.props;

    const { api } = this.context;

    const choice = await api.showDialog('question', 'Confirm publishing', {
      text: 'Are you sure you want to upload the collection "{{collectionName}}"? '
          + 'Once uploaded you can hide or update a collection but it can\'t be removed. '
          + 'Please note: By uploading you agree that you adhere to the user agreement. '
          + 'In particular you agree that you aren\'t violating anyone\'s copyright and you '
          + 'agree to release your Collection (the list itself, instructions, ....) to '
          + 'the public domain.',
      parameters: {
        collectionName: util.renderModName(mods[modId]),
      },
    }, [
      { label: 'Cancel' },
      { label: 'Publish' },
    ]);

    if (choice.action === 'Publish') {
      try {
        const collectionId = await doExportToAPI(api, profile.gameId, modId);
        if (collectionId !== undefined) {
          api.sendNotification({
            type: 'success',
            message: 'Collection submitted',
            actions: [
              {
                title: 'Open in Browser', action: () => {
                  const game = selectors.gameById(api.getState(), profile.gameId);
                  // tslint:disable-next-line: max-line-length
                  const domainName = (util as any).nexusGameId(game);
                  const url = `${NEXUS_BASE_URL}/${domainName}/collections/${collectionId}`;
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

const emptyObj = {};

function mapStateToProps(state: types.IState): IConnectedProps {
  const profile = selectors.activeProfile(state);
  const game = selectors.gameById(state, profile.gameId);
  return {
    game,
    profile,
    mods: state.persistent.mods[profile.gameId] || emptyObj,
    notifications: state.session.notifications.notifications,
    downloads: state.persistent.downloads.files,
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
