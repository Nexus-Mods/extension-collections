import { updateSuccessRate } from '../../actions/persistent';
import { MOD_TYPE, NAMESPACE } from '../../constants';
import { doExportToAPI } from '../../modpackExport';
import { findModByRef, findDownloadIdByRef } from '../../util/findModByRef';
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
import { actions, ComponentEx, FlexLayout, MainPage, selectors, tooltip,
          types, util } from 'vortex-api';

export interface ICollectionsMainPageBaseProps extends WithTranslation {
  active: boolean;
  secondary: boolean;

  driver: InstallDriver;
  cache: InfoCache;
  onSetupCallbacks?: (callbacks: { [cbName: string]: (...args: any[]) => void }) => void;
  onCreateCollection: (profile: types.IProfile, name: string) => void;
}

interface IConnectedProps {
  profile: types.IProfile;
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
    const { t, downloads, mods, notifications, profile } = this.props;
    const { matchedReferences, selectedCollection, viewMode } = this.state;

    const collection = (selectedCollection !== undefined)
      ? mods[selectedCollection]
      : undefined;

    let content = null;

    if (collection === undefined) {
      content = (
        <StartPage
          t={t}
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
              {t('Back')}
            </tooltip.IconButton>
          </FlexLayout.Fixed>
          <FlexLayout.Flex>
            {(viewMode === 'view') ? (
              <CollectionPage
                t={t}
                className='collection-details'
                driver={this.props.driver}
                cache={this.props.cache}
                profile={profile}
                collection={collection}
                mods={mods}
                downloads={downloads}
                notifications={notifications}
                onView={this.view}
                onPause={this.pause}
                onCancel={this.cancel}
                onVoteSuccess={this.voteSuccess}
              />
            )
              : (
                <CollectionEdit
                  profile={profile}
                  collection={collection}
                  mods={mods}
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

  private cancel = async (modId: string) => {
    const { downloads, mods, profile } = this.props;
    const { api } = this.context;
    
    const result = await api.showDialog('question', 'Are you sure you want to cancel the installation', {
      text: 'Choose to delete the collection and its content or to cancel the install',
    }, [
      { label: 'Cancel and delete' },
      { label: 'Cancel' },
    ]);

    // apparently one can't cancel out of the cancellation...

    // either way, delete all running downloads
    const collection = mods[modId];
    await Promise.all(collection.rules.map(async rule => {
      const dlId = findDownloadIdByRef(rule.reference, downloads);

      if (dlId !== undefined) {
        await util.toPromise(cb => api.events.emit('remove-download', dlId, cb));
      }
    }));

    if (result.action === 'Cancel and delete') {
      await Promise.all(collection.rules.map(async rule => {
        const mod = findModByRef(rule.reference, mods);
        if (mod !== undefined) {
          const dlId = mod.archiveId;
          await util.toPromise(cb => api.events.emit('remove-mod', profile.gameId, mod.id, cb));
          if ((dlId !== undefined) && (downloads[dlId])) {
            await util.toPromise(cb => api.events.emit('remove-download', dlId, cb));
          }
        }
      }));
    }
  }

  private voteSuccess = async (modId: string, success: boolean) => {
    const { mods } = this.props;
    const { api } = this.context;

    const collection = mods[modId];

    const { collectionId, revisionId } = collection.attributes;

    if (revisionId === undefined) {
      return;
    }

    const voted = (api.emitAndAwait('rate-nexus-collection-revision',
                                    parseInt(revisionId, 10), success ? 10 : -10))[0];
    if (voted) {
      api.store.dispatch(updateSuccessRate(collectionId, revisionId, success));
    }
  }

  private updateMatchedReferences(props: ICollectionsMainPageProps) {
    const { mods } = props;
    const collections = Object.values(mods).filter(mod => mod.type === MOD_TYPE);
    return collections.reduce((prev, collection) => {
      prev[collection.id] =
        (collection.rules || []).map(rule => findModByRef(rule.reference, mods));
      return prev;
    }, {});
  }

  private remove = (modId: string) => {
    const { mods, profile } = this.props;
    this.context.api.showDialog('question', 'Confirm removal', {
      text: 'Are you sure you want to remove the collection "{{collectionName}}"? '
          + 'This will remove the collection but not the mods installed with it.\n'
          + 'This can not be undone',
      parameters: {
        collectionName: util.renderModName(mods[modId]),
      },
    }, [
      { label: 'Cancel' },
      { label: 'Remove' },
    ])
    .then(res => {
      if (res.action === 'Remove') {
        (util as any).removeMods(this.context.api, profile.gameId, [modId]);
      }
    });
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
                  util.opn(`https://www.nexusmods.com/${profile.gameId}/collections/${collectionId}`).catch(() => null);
                }
              }
            ]
          });
        }
      } catch (err) {
        if (!(err instanceof util.UserCanceled) && !(err instanceof util.ProcessCanceled)) {
          api.showErrorNotification('Failed to publish to API', err);
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
  return {
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
