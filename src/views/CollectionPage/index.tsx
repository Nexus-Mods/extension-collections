import { NAMESPACE } from '../../constants';

import CollectionEdit from './CollectionEdit';
import CollectionPage from './CollectionPage';
import StartPage from './StartPage';

import I18next from 'i18next';
import * as React from 'react';
import { WithTranslation, withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import * as Redux from 'redux';
import { ThunkDispatch } from 'redux-thunk';
import { ComponentEx, MainPage, selectors, types, actions, util, tooltip, FlexLayout } from 'vortex-api';

export interface ICollectionsMainPageBaseProps extends WithTranslation {
  active: boolean;
  secondary: boolean;

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
  viewMode: 'view' | 'edit';
}

class CollectionsMainPage extends ComponentEx<ICollectionsMainPageProps, IComponentState> {
  constructor(props: ICollectionsMainPageProps) {
    super(props);
    this.initState({
      selectedCollection: undefined,
      viewMode: 'view',
    });
  }

  public render(): JSX.Element {
    const { t, downloads, mods, notifications, profile } = this.props;
    const { selectedCollection, viewMode } = this.state;

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
          onView={this.view}
          onEdit={this.edit}
          onRemove={this.remove}
          onCreateCollection={this.createCollection}
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
                profile={profile}
                collection={collection}
                mods={mods}
                downloads={downloads}
                notifications={notifications}
                onView={this.view}
              />
            )
              : (
                <CollectionEdit
                  t={t}
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
    })
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
    withTranslation(['common', NAMESPACE])(CollectionsMainPage));
